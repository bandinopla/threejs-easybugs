import { Vector3 } from "three";
import { GroundStrategy } from "./GroundStrategy";
import { GroundPosition } from "./GroundPosition";

const v = new Vector3();
const down = new Vector3(0, -1, 0);

export class BasicGroundFinder extends GroundStrategy {
	override worldPositionToGravityDirection(
		out: Vector3,
		inCageSpace?: boolean,
	) {
		out.copy(down);

		if (!inCageSpace) {
			out.transformDirection(this.raycastCage.matrixWorld);
		}

		return out;
	}

	override randomRayPosition(
		pos: GroundPosition,
		fromCurrentRatio?: number,
		minDist = 0,
	) {
		// random point at the ceiling
		v.set(Math.random() - 0.5, 0.5, Math.random() - 0.5);

		//v.set(1, 0, 0);

		if (fromCurrentRatio) {
			v.multiplyScalar(fromCurrentRatio);

			if (minDist) {
				if (v.length() < minDist) {
					v.setLength(minDist);
				}
			}

			v.add(pos.position);
		}

		v.y = 0.5;
		v.x = Math.max(Math.min(0.5, v.x), -0.5);
		v.z = Math.max(Math.min(0.5, v.z), -0.5);

		pos.normal.set(0, 1, 0);
		pos.normal.transformDirection(this.raycastCage.matrixWorld);

		pos.raycastCage = this.raycastCage;
	}

	override randomGroundPosition(
		pos: GroundPosition,
		inRadiusOfPos = 0,
		minDist = 0,
	) {
		this.randomRayPosition(pos, inRadiusOfPos, minDist);
	}

	override worldToRayOrigin(worldPos: Vector3, inWorldSpace = true): Vector3 {
		this.context.raycastCage!.worldToLocal(worldPos);

		if (worldPos.y < 0) {
			worldPos.y = 0;
		}

		v.y = 0.5;
		v.x = Math.max(Math.min(0.5, v.x), -0.5);
		v.z = Math.max(Math.min(0.5, v.z), -0.5);

		if (inWorldSpace) this.context.raycastCage!.localToWorld(worldPos);

		return worldPos;
	}
}
