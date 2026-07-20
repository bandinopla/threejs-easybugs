import {
	AxesHelper,
	Bone,
	Intersection,
	Matrix3,
	Matrix4,
	Mesh,
	Object3D,
	Quaternion,
	Scene,
	SkinnedMesh,
	Vector3,
} from "three";
import { Raycaster } from "three";
import { throttle } from "./util/throttle";
import { GroundStrategy } from "./ground-strategy/GroundStrategy";
import { BasicGroundFinder } from "./ground-strategy/BasicGroundFinder";
import { DomeGroundFinder } from "./ground-strategy/DomeGroundFinder";
import { GroundSurfaceContext } from "./ground-strategy/GroundSurfaceContext";
import { BugBehaviour } from "./behaviour/BugBehaviour";
import { RandomWalkingBug } from "./behaviour/RandomWalker";
import { CCDIKSolver, IK } from "three/examples/jsm/Addons.js";
import {
	BugIKLegs,
	BugIKLegsConfig,
	GaitFunction,
	LegIKConfig,
} from "./BugIKLegs";
import { GroundPosition } from "./ground-strategy/GroundPosition";
import { copyRotation } from "./util/copyRotation";

export type BugRaycastType = "dome" | "basic";
const v = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const v4 = new Vector3();
const q = new Quaternion();
const q2 = new Quaternion();
const m4 = new Matrix4();
const m3 = new Matrix3();
const EPSILON_SQ = 0.0001;
const EPSILON_ANCHOR = 0.01;

export type BugRigOpts = {
	collisionLayer: number;
	groundCheckInterval: number;
};

export type RaycastCageMeta = {
	isStatic: boolean;
};

let t = 0;
let $idx = 0;

export class BugRig {
	readonly idx: number = ++$idx;
	readonly body: Object3D;
	private _raycastType: BugRaycastType = "basic";
	private _setRandomPosition = false;

	private _groundStrategy: GroundStrategy;
	private _groundStrategies: Map<BugRaycastType, GroundStrategy>;

	/**
	 * Optional custom ray caster function provided by the user.
	 */
	castRay?: (from: Vector3, direction: Vector3) => Intersection[];

	private _castRay?: (from: Vector3, direction: Vector3) => Intersection[];
	private _scene: Scene | undefined;

	private _config: BugRigOpts;
	private _groundContext: GroundSurfaceContext;
	private _defaultBehaviour: BugBehaviour;

	private _behaviour?: BugBehaviour;
	private _lastBodyPosition: Vector3;

	private _groundCheckTime = 0;

	private _ik?: BugIKLegs;
	private _raycastCageMeta: WeakMap<Object3D, RaycastCageMeta> =
		new WeakMap();

	set behaviour(b: BugBehaviour | undefined) {
		if (b === this._behaviour) return;
		if (this._behaviour) this._behaviour.exit();

		this._behaviour = b;

		b?.enter(this._groundContext, () => this._groundStrategy);
	}

	/**
	 * Defines how this bug will move. If set to undefined it will use the defaul
	 * behaviour of picking random positions.
	 */
	get behaviour() {
		return this._behaviour ?? this._defaultBehaviour;
	}

	constructor(body: Object3D, config?: Partial<BugRigOpts>) {
		this.body = body;
		this._config = {
			collisionLayer: 0,
			groundCheckInterval: 0.1,
			...config,
		};

		this._groundContext = {
			getRaycaster: this.getRaycaster,
			currentPos: new GroundPosition(body.parent!),
			targetPos: new GroundPosition(body.parent!),
			lastPos: new GroundPosition(body.parent!),
			object: body,
		};

		this._groundStrategies = new Map([
			["basic", new BasicGroundFinder(this._groundContext)],
			["dome", new DomeGroundFinder(this._groundContext)],
		]);

		this._groundStrategy = this._groundStrategies.get("basic")!;
		this._defaultBehaviour = new RandomWalkingBug();

		this.behaviour = this._defaultBehaviour;

		this._lastBodyPosition = new Vector3().copy(this.body.position);
	}

	/**
	 * Define the IK solver ( `CCDIKSolver` ) for this rig's skeleton.
	 *
	 */
	setupLegsIK(config: BugIKLegsConfig) {
		if (this._ik) {
			throw new Error(`BugRig: setupLegsIk can only be called once!`);
		}

		this._ik = new BugIKLegs(
			this.getRaycaster,
			() => this._groundStrategy,
			this.body,
			config,
		);
	}

	syncLegsIK() {
		this._ik?.syncLegsIK();
	}

	/**
	 * returns the function to be used to cast rays and hit surfaces...
	 */
	private getRaycaster = () => {
		if (!this.castRay) {
			if (!this._scene) {
				let scene = this.body.parent;
				while (scene && !(scene instanceof Scene) && scene.parent)
					scene = scene.parent;

				if (scene instanceof Scene) this._scene = scene;
				else throw "BugRig: could not find scene";
			}

			const raycaster = new Raycaster();
			raycaster.layers.set(this._config.collisionLayer);

			this._castRay = (from: Vector3, direction: Vector3) => {
				raycaster.set(from, direction);
				return raycaster.intersectObjects(this._scene!.children, true!);
			};
		}

		return (this.castRay || this._castRay)!;
	};

	setRaycastCage(
		object: Object3D,
		rayStrategy: BugRaycastType = "basic",
		isStatic = true,
	) {
		this._groundContext.raycastCage = object;
		this._groundStrategy = this._groundStrategies.get(rayStrategy)!;

		//info about the cage...
		this._raycastCageMeta.set(object, { isStatic });
	}

	/**
	 * Sets a random position and normal in world space for the bug to start from.
	 * THis will set both current position and goal position to the same value.
	 */
	placeAtRandomPosition() {
		this._setRandomPosition = true;
	}

	update(dt: number, _updateIKLegs = false) {
		this._groundCheckTime += dt;

		if (this._setRandomPosition) {
			// get a random position
			this._groundStrategy.randomRayPosition(
				this._groundContext.targetPos,
			);

			// stick to the ground's surface...
			this._groundStrategy.worldToGroundPosition(
				this._groundContext.targetPos.worldPosition(v),
				this._groundContext.targetPos,
			);

			this._groundContext.currentPos.copy(this._groundContext.targetPos);
			this._groundContext.lastPos.copy(this._groundContext.targetPos);

			this._ik?.resetFootPosition();

			this._setRandomPosition = false;
		} else {
			// stick to ground---

			//if (this._groundCheckTime > this._config.groundCheckInterval) {
			this._groundCheckTime = 0;
			this._groundContext.currentPos.worldPosition(v);

			this._groundStrategy.worldToGroundPosition(
				v,
				this._groundContext.currentPos,
			);
			//}

			this.moveTowardsTarget(dt);
		}

		this.syncBody(dt);

		if (!this.behaviour?.isPaused) this._ik?.update(dt, _updateIKLegs);
	}

	/**
	 * modify the currentPos and target pos according to some behaviour...
	 */
	private moveTowardsTarget(dt: number) {
		this.behaviour!.moveTowardsGoal(dt);
	}

	private syncBody(delta: number) {
		this._groundContext.currentPos.place(this.body);

		const up = this._groundContext.currentPos.normal; // direction of the UP in world space
		//const forward = v.copy(this.body.position).sub(this._lastBodyPosition).normalize(); // forward in body's local space...

		// make this.body quaternion slerp slowly towards having its UP match up, and its forward match forward...
		// you have temporal variables: v, v2, v3 and matrices m3 and m4 available.
		const forward = v.copy(this.body.position).sub(this._lastBodyPosition);

		// Keep the previous orientation if there is essentially no movement.
		if (forward.lengthSq() > 1e-8) {
			forward
				.transformDirection(this.body.parent!.matrixWorld)
				.normalize();

			// Project forward onto the plane defined by the up vector.
			forward.addScaledVector(up, -forward.dot(up)).normalize();

			// // If nearly parallel to up, derive a forward from the current orientation.
			// if (forward.lengthSq() < 1e-8) {
			// 	forward.set(0, 0, 1).applyQuaternion(this.body.quaternion);
			// 	forward.addScaledVector(up, -forward.dot(up)).normalize();
			// }

			const right = v2.crossVectors(up, forward).normalize();
			//forward.crossVectors(up, right).normalize();
			forward.crossVectors(right, up).normalize();

			m4.makeBasis(right, up, forward);

			q.setFromRotationMatrix(m4);

			this.body.quaternion.slerp(q, delta * 5);
		}

		this._lastBodyPosition.copy(this.body.position);
		this._groundContext.lastPos.copy(this._groundContext.currentPos);
	}
}
