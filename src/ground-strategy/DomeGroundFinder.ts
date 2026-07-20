import { Vector3 } from "three";
import { GroundStrategy, v } from "./GroundStrategy";
import { GroundPosition } from "./GroundPosition";

export class DomeGroundFinder extends GroundStrategy {
	override worldPositionToGravityDirection(out: Vector3) {
		return this.worldToRayOrigin(out, false)
			.negate()
			.transformDirection(this.raycastCage.matrixWorld);
	}

	override randomRayPosition(
		pos: GroundPosition,
		fromCurrentRatio?: number,
		minDist = 0,
	) {
		v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5);

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

		if (v.y < 0) v.y = 0;

		v.setLength(1);

		pos.position.copy(v);

		const up = v;

		pos.normal.copy(up);
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

		worldPos.setLength(1);

		if (inWorldSpace) this.context.raycastCage!.localToWorld(worldPos);

		return worldPos;
	}
}
