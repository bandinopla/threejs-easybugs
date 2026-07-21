import { Matrix3, Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { GroundSurfaceContext } from "./GroundSurfaceContext";
import { GroundPosition } from "./GroundPosition";
import { worldQuaternionToLocal } from "../util/worldQuaternionToLocal";

export const v = new Vector3();

const v2 = new Vector3();
const q = new Quaternion();
const m3 = new Matrix3();
const m4 = new Matrix4();

export abstract class GroundStrategy {
	constructor(readonly context: GroundSurfaceContext) {}

	/**
	 * get a random position from which to
	 */
	randomRayPosition(
		pos: GroundPosition,
		fromCurrentRatio?: number,
		minDist = 0,
	) {}

	randomGroundPosition(pos: GroundPosition, inRadiusOfPos = 0, minDist = 0) {}

	get raycastCage() {
		return this.context.raycastCage!;
	}

	/**
	 * Mutate the vector. Return a new point that can be used safetly to cast a ray in the direction of this point towards
	 * what we consider the ground.
	 *
	 * @param worldPos
	 * @returns
	 */
	worldToRayOrigin(worldPos: Vector3, inWorldSpace = true) {
		return worldPos;
	}

	/**
	 *  given a point in world space, return a vector that represents the direction in which gravity is pulling that point.
	 *  This vector points towards the ground.
	 *
	 * @param out the vector to store the result in.
	 * @param inCageSpace if true, the vector will be in the local space of the raycast cage. Default to world space.
	 */
	worldPositionToGravityDirection(
		out: Vector3,
		inCageSpace = false,
	): Vector3 {
		throw new Error(`Not implemented`);
	}

	worldToLocalPosition(worldPos: Vector3, out?: GroundPosition) {
		if (!out) {
			out = new GroundPosition(this.raycastCage, worldPos.clone());
		} else {
			out.position.copy(worldPos);
			out.raycastCage = this.raycastCage;
		}

		this.context.raycastCage!.worldToLocal(out.position);

		return out;
	}

	/**
	 * This takes a world position, and, using the rules of the ground strategy, will cast a ray to find the ground under this
	 * position and return that ground position.
	 *
	 * @param worldPosition
	 * @param out the position is the local space of the raycast cage.
	 * @returns
	 */
	worldToGroundPosition(
		worldPosition: Vector3,
		out?: GroundPosition,
		test = false,
	): GroundPosition | undefined {
		if (!out) {
			out = new GroundPosition(this.raycastCage, worldPosition.clone());
		} else {
			out.position.copy(worldPosition);
			out.raycastCage = this.raycastCage;
		}

		// find ray position based on this world position...
		const rayOrigin = this.worldToRayOrigin(out.position, true); // local position of the ray
		const rayDirection = this.worldPositionToGravityDirection(
			v.copy(rayOrigin),
		);

		// if (test) {
		// 	out.position.copy(rayOrigin).add(rayDirection);
		// 	out.raycastCage.worldToLocal(out.position);

		// 	return out;
		// }

		// cast a ray and find our ground...
		const hits = this.context.getRaycaster()(rayOrigin, rayDirection);

		if (hits && hits.length) {
			const [hit] = hits;

			// position of the hit in the raycast's cage local space
			out.position.copy(hit.point);
			out.raycastCage.worldToLocal(out.position);

			// default to identity....

			// calculate orientation...
			if (hit.normal) {
				hit.normal.applyNormalMatrix(
					m3.getNormalMatrix(hit.object.matrixWorld),
				);

				out.normal.copy(hit.normal);
			}

			return out;
		}

		return undefined;
	}
}
