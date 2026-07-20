import {
	AxesHelper,
	Bone,
	BoxGeometry,
	Intersection,
	Mesh,
	MeshBasicMaterial,
	MeshNormalMaterial,
	Object3D,
	SkinnedMesh,
	SphereGeometry,
	Vector3,
} from "three";
import { CCDIKSolver, IK } from "three/examples/jsm/Addons.js";
import { GroundStrategy, v } from "./ground-strategy/GroundStrategy";
import { basicGait } from "./gait/BasicGait";
import { GroundPosition } from "./ground-strategy/GroundPosition";

const currentWPos = new Vector3();
const goalWPos = new Vector3();
const guideWPos = new Vector3();

export type GaitBone = {
	bone: Bone;
	canMove: boolean;
};

export type GaitFunction = (list: GaitBone[]) => Generator<void, void, unknown>;

type Gait = ReturnType<GaitFunction>;

export type LegIKConfig = {
	goal: string;
	foot: string;
	mirror?: boolean;
	chainLength: number;
	rotationMin?: Vector3;
	rotationMax?: Vector3;
};

interface LegIKSolver {
	/**
	 * bones that during the authoring of the rig are placed at the "goal" of the IK chain. Usually right under the feet.
	 * The place at which the foot should be positioned by the IK solver. On a blender rig, these are the target bones of the IK modifier,
	 * should be parented to the root, not in the same chain as the feet...
	 */
	ikGoals: Bone[];
	update(globalBlendFactor?: number): void;
}

// let's keep this as a dictionary because many bugs may be created that point to the same skeleton in case of using instancing...
const rig2solver = new Map<Object3D, LegIKSolver>();

type LegState = {
	currentPos: GroundPosition;
	oldTargetPos: GroundPosition;
	targetPos: GroundPosition;
	bone: Bone;
	isMoving?: boolean;
};

export type BugIKLegsConfig = {
	/**
	 * the object that contains the skeleton
	 */
	rig?: Object3D;

	/**
	 * configure the legs of the bug...
	 */
	legs: LegIKConfig[];

	/**
	 * How many iterations of the CCD algorithm to run.
	 */
	iterations?: number;

	/**
	 * function to use to plan the next steps...
	 */
	gaitFunction?: GaitFunction;

	/**
	 * In seconds. Time taken for feet to transition from one position to the other.
	 */
	stepTransitionDuration?: number;

	/**
	 * How high the foot is lifted off the ground when . In local space of the rig.
	 */
	stepHeight?: number;

	/**
	 * if the foot is further than this distance away from the goal, the foot will be
	 * ellegible to transition to the goal. In world space.
	 */
	footMaxDistanceFromGoal?: number;

	/**
	 * true will add gizmos to visualize where the legs are aiming
	 */
	debug?: boolean;
};

/**
 * this class manages how the legs of the bugs will move
 */
export class BugIKLegs {
	private _legsIKSolver!: LegIKSolver;
	private _resetFootPositions = false;
	private _lastKnownDelta = 0;
	private _foo: Map<Bone, Object3D> = new Map();
	private _legState: Map<Bone, LegState> = new Map();

	enabled = true;

	private _gaitFunction!: GaitFunction;
	private _gaitIterator?: Gait;
	private _gaitActives: GaitBone[];
	private _transitionTime = 0;

	private readonly _ikConfig: Required<BugIKLegsConfig>;
	private readonly rig: Object3D;

	private _debug: boolean = false;

	/**
	 * @param castRay Function that casts a ray and returns the intersection. (world space)
	 * @param getGroundStrategy Function that returns the ground strategy ( how the ground is found )
	 * @param rig The rig of the bug, usually the "armature" in blender.
	 * @param body The body of this bug. The object that wraps this object and represents the "bug" in the scene.
	 * @param ikConfig The IK configuration of the bug.
	 */
	constructor(
		private castRay: () => (
			from: Vector3,
			direction: Vector3,
		) => Intersection[],
		private getGroundStrategy: () => GroundStrategy,
		private readonly body: Object3D,
		ikConfig: BugIKLegsConfig,
	) {
		this._ikConfig = {
			rig: ikConfig.rig ?? body,
			legs: ikConfig.legs,
			footMaxDistanceFromGoal: ikConfig.footMaxDistanceFromGoal ?? 0.1,
			gaitFunction: ikConfig.gaitFunction ?? basicGait,
			iterations: ikConfig.iterations ?? 16,
			stepTransitionDuration: ikConfig.stepTransitionDuration ?? 0.2,
			stepHeight: ikConfig.stepHeight ?? 1,
			debug: ikConfig.debug ?? false,
		};

		this._debug = this._ikConfig.debug;

		if (this._debug) {
			this.body.add(new AxesHelper(3));
		}

		const rig = this._ikConfig.rig;
		this.rig = rig;

		//
		// reuse if we have already established the solver for this particular rig...
		//
		if (rig2solver.has(rig)) {
			this._legsIKSolver = rig2solver.get(rig)!;
		} else {
			// --- obtain the bones...

			let skin!: SkinnedMesh;
			let bones: Bone[] | undefined;
			rig.traverse((o) => {
				if (!skin && o instanceof SkinnedMesh) {
					skin = o;
				}
				if (!bones && o instanceof SkinnedMesh) {
					bones = o.skeleton.bones;
				}
			});

			if (!skin) {
				throw new Error(`No SkinnedMesh found in the rig!`);
			}

			if (!bones) {
				throw new Error(`No bones found in the rig!`);
			}

			//----------------------

			const idx = (name: string) =>
				bones!.findIndex(
					(b) => b.name === name || b.userData.name == name,
				);

			const iks: IK[] = this._ikConfig.legs

				.reduce<LegIKConfig[]>((acc, cfg) => {
					acc.push(cfg);

					if (cfg.mirror) {
						acc.push({
							chainLength: cfg.chainLength,
							foot: cfg.foot.includes(".L")
								? cfg.foot.replace(".L", ".R")
								: cfg.foot.replace(".R", ".L"),
							goal: cfg.goal.includes(".L")
								? cfg.goal.replace(".L", ".R")
								: cfg.goal.replace(".R", ".L"),
							rotationMax: cfg.rotationMax,
							rotationMin: cfg.rotationMin,
						});
					}

					return acc;
				}, [])

				.map((cfg) => {
					const targetBoneIdx = idx(cfg.goal);
					const effectorBoneIdx = idx(cfg.foot);
					const links: IK["links"] = [];
					let link = bones![effectorBoneIdx];

					for (let i = 0; i < cfg.chainLength; i++) {
						link = link.parent as Bone;
						if (!link) {
							throw new Error(
								`Chain length seems to be greater than the actual chain length from ${cfg.foot} and up.`,
							);
						}

						links.push({
							index: idx(link.name),
							rotationMax: cfg.rotationMax,
							rotationMin: cfg.rotationMin,
						});
					}

					return {
						target: targetBoneIdx,
						effector: effectorBoneIdx,
						links,
						iteration: this._ikConfig.iterations,
					};
				});

			const solver = new CCDIKSolver(skin, iks);
			const ikGoals = iks.map((cfg) => {
				const ikGoal = bones![cfg.target];

				// rest pose
				ikGoal.userData.restPos = ikGoal.position.clone();
				return ikGoal;
			});

			rig2solver.set(rig, {
				ikGoals,
				update(globalBlendFactor?: number) {
					solver.update(globalBlendFactor);
				},
			});
		}

		this._legsIKSolver = rig2solver.get(rig)!;
		this._gaitFunction = this._ikConfig.gaitFunction;

		this._gaitActives = this._legsIKSolver.ikGoals.map<GaitBone>(
			(bone) => ({
				bone,
				canMove: false,
			}),
		);

		this._gaitIterator = this._gaitFunction(this._gaitActives);
		this.moveGait();
	}

	/**
	 * defines which legs are allowed to move and the duration allowed to do so.
	 */
	private moveGait() {
		this._gaitIterator?.next();
		this._transitionTime = this._ikConfig.stepTransitionDuration;
	}

	/**
	 * Place foots at guide goals
	 */
	resetFootPosition() {
		this._resetFootPositions = true;
	}

	update(delta: number, updateIKs = true) {
		this._lastKnownDelta = delta;

		if (!this.enabled) return;
		if (updateIKs) this.syncLegsIK();
	}

	/**
	 * Solve the legs IK to change the pose of the skeleton
	 */
	syncLegsIK() {
		if (!this.enabled) return;

		const feetIKGoals = this._legsIKSolver.ikGoals;
		const ground = this.getGroundStrategy();

		ground.raycastCage.parent!.updateMatrixWorld(true);

		/**
		 * if any leg is transitioning this will be set to true
		 */
		let isTransitioning = false;

		this._transitionTime -= this._lastKnownDelta;

		/**
		 * Should lerp ikGoal pos like this:
		 * 0 = currentPos
		 * 1 = targetPos
		 */
		let transitionProgress =
			1 - this._transitionTime / this._ikConfig.stepTransitionDuration;

		// for each ik goal...

		for (let i = 0; i < feetIKGoals.length; i++) {
			const ikGoalBone = feetIKGoals[i];

			//debug icon...
			if (this._debug && !this._foo.has(ikGoalBone)) {
				const foo = new Mesh(
					new SphereGeometry(0.2),
					new MeshNormalMaterial(),
				);
				this.body.add(foo);
				this._foo.set(ikGoalBone, foo);

				// line
				const lineGeo = new BoxGeometry(0.1, 0.1, 1);
				lineGeo.translate(0, 0, 0.5);
				const line = new Mesh(
					lineGeo,
					new MeshBasicMaterial({ color: 0x005555 }),
				);

				foo.add(line);
			}

			// lazy init leg's state
			if (!this._legState.has(ikGoalBone)) {
				//ikGoalBone.getWorldPosition(v);

				//
				// ik goals are ssumed to be at the root or parented to a bone that is at the root.
				//
				v.copy(ikGoalBone.position);
				this.body.localToWorld(v);

				const groundPos = ground.worldToLocalPosition(v);

				this._legState.set(ikGoalBone, {
					currentPos: groundPos,
					oldTargetPos: groundPos.clone(),
					targetPos: groundPos.clone(),
					bone: ikGoalBone,
				});
			}

			const foo = this._foo.get(ikGoalBone)!;

			const state = this._legState.get(ikGoalBone)!;
			const gaitMeta = this._gaitActives[i];
			let canTransition = gaitMeta.canMove;

			if (this._resetFootPositions) {
				//
				// reset means, place the legs at the goal targets
				//
				//place at raycast from guide

				//
				// The position of the "guide" (a.k.a. the IK goal at rest pose) in the local space of the rig.
				// We assume the rig's origin is the same as the body's origin
				//
				v.copy(ikGoalBone.userData.restPos);
				this.body.localToWorld(v);

				//ground.raycastCage.worldToLocal(v);
				//state.currentPos.position.copy(v);

				ground.worldToGroundPosition(v, state.currentPos);
				// if (!ground.worldToGroundPosition(v, state.currentPos)) { // // if a ground position was NOT found....
				// 	ground.worldToLocalPosition(v, state.currentPos);
				// }

				state.oldTargetPos.copy(state.currentPos);
				state.targetPos.copy(state.currentPos);

				canTransition = false;
			}

			if (canTransition) {
				// get world position of the current "planted foot" position
				state.currentPos.worldPosition(currentWPos);

				if (state.isMoving) {
					isTransitioning = true;

					// world pos of the target...
					state.targetPos.worldPosition(goalWPos);

					// interpolates the current position to the target position
					v.lerpVectors(currentWPos, goalWPos, transitionProgress);

					if (transitionProgress >= 1) {
						state.isMoving = false;
						state.currentPos.copy(state.targetPos);
					}

					// move the actual IK bone...
					this.body.worldToLocal(v);
					ikGoalBone.position.copy(v);
					isTransitioning = true;
				} else {
					// get the world position of the "rest position" of the foot
					guideWPos.copy(ikGoalBone.userData.restPos);
					this.body.localToWorld(guideWPos);

					// current offset
					v.subVectors(guideWPos, currentWPos);

					//are we far behind?
					if (v.length() > this._ikConfig.footMaxDistanceFromGoal) {
						// we are behind, we need to move...
						state.isMoving = true;
						ground.worldToGroundPosition(
							//guideWPos,
							guideWPos.add(v.multiplyScalar(0.3)), //<-- a little ahead
							state.targetPos,
						);
						isTransitioning = true;
					}

					//
				}

				//if needed, do it...
			} else {
				// place foot at current position...
				state.currentPos.worldPosition(v);
				this.body.worldToLocal(v);
				ikGoalBone.position.copy(v);
			}

			if (this._debug) {
				foo.position.copy(ikGoalBone.position);

				foo.children[0].lookAt(
					this.body.localToWorld(v.copy(ikGoalBone.userData.restPos)),
				);
				foo.children[0].scale.z = ikGoalBone.position.distanceTo(
					ikGoalBone.userData.restPos,
				);
			}
		}

		feetIKGoals[0].parent!.updateMatrixWorld(true);

		this._legsIKSolver.update();
		this._resetFootPositions = false;

		// if no leg needs to move, move on to the next batch...
		if (!isTransitioning || transitionProgress >= 1) {
			this.moveGait();
		}
	}
}
