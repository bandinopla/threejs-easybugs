import { GroundSurfaceContext } from "../ground-strategy/GroundSurfaceContext";
import { GroundStrategy } from "../ground-strategy/GroundStrategy";
import { Object3D, Vector3 } from "three";

const currentWPos = new Vector3();
const targetWPos = new Vector3();

/**
 * Defines how the bug will move. It calculates `context.targetPos` ( in local space of `context.raycastCage`)
 * This class should only think about positioning the bug. Not rotation since the rotation will be calculated based on the current and previous position
 */
export abstract class BugBehaviour {
	protected context!: GroundSurfaceContext;
	protected getGroundStrategy!: () => GroundStrategy;
	protected _pauseConfig: { min: number; max: number } = { min: 0.1, max: 1 };
	private _pauseFor = 0;
	protected closeToTargetThreshold = 0.05;
	protected pauseProbability = 0.8;
	protected speed = 0.1;

	get isPaused() {
		return this._pauseFor > 0;
	}

	enter(
		context: GroundSurfaceContext,
		getGroundStrategy: () => GroundStrategy,
	) {
		this.context = context;
		this.getGroundStrategy = getGroundStrategy;
	}

	/**
	 * updates the target position and other state variables from the context.
	 * `currentPos` and  `targetPos` from context are in the LOCAL space of the `raycastCage`
	 * @param dt delta time in seconds
	 */
	moveTowardsGoal(dt: number) {
		if (this._pauseFor > 0) {
			this._pauseFor -= dt;
			return;
		}

		this.context.currentPos.worldPosition(currentWPos);
		this.context.targetPos.worldPosition(targetWPos);

		if (currentWPos.distanceTo(targetWPos) < this.closeToTargetThreshold) {
			if (Math.random() > this.pauseProbability) {
				this._pauseFor =
					this._pauseConfig.min +
					Math.random() *
						(this._pauseConfig.max - this._pauseConfig.min);
				return;
			}

			this.calculateNextStepFor(
				this.context.object,
				targetWPos.set(0, 0, 0),
			);

			this.context.object.localToWorld(targetWPos);

			// this.getGroundStrategy().raycastCage.worldToLocal(
			// 	this.context.targetPos.position,
			// );
			// this.context.targetPos.raycastCage =
			// 	this.getGroundStrategy().raycastCage;

			//stick to ground
			this.getGroundStrategy().worldToGroundPosition(
				targetWPos,
				this.context.targetPos,
			);
		}

		const dir = targetWPos.sub(currentWPos).normalize();

		currentWPos.addScaledVector(dir, this.speed * dt);

		this.context.currentPos.raycastCage.worldToLocal(currentWPos);
		this.context.currentPos.position.copy(currentWPos);
	}

	/**
	 * Calculate a point in the local space of `body` to know where to move next.
	 *
	 * @param body the body of the bug. The possitive Z is the forward direction and Y is the current up.
	 * @param nextStep this position is in local space of `body` set it to know where to steer the bug
	 */
	protected abstract calculateNextStepFor(
		body: Object3D,
		nextStep: Vector3,
	): void;

	exit() {
		this._pauseFor = 0;
	}
}
