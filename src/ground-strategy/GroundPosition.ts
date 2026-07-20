import { Object3D, Quaternion, Vector3 } from "three";

export class GroundPosition {
	position: Vector3;
	raycastCage: Object3D;

	/**
	 * world normal
	 */
	normal: Vector3;

	constructor(
		raycastCage: Object3D,
		position = new Vector3(),
		normal = new Vector3(0, 1, 0),
	) {
		this.position = position;
		this.raycastCage = raycastCage;
		this.normal = normal;
	}

	clone() {
		return new GroundPosition(
			this.raycastCage,
			this.position.clone(),
			this.normal.clone(),
		);
	}

	copy(from: GroundPosition) {
		this.position.copy(from.position);
		this.raycastCage = from.raycastCage;
		this.normal.copy(from.normal);
		return this;
	}

	worldPosition(v = new Vector3()) {
		v.copy(this.position);
		return this.raycastCage.localToWorld(v);
	}

	place(obj: Object3D) {
		this.worldPosition(obj.position);
		obj.parent?.worldToLocal(obj.position);
	}
}
