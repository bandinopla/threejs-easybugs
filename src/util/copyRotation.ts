import { Object3D, Quaternion } from "three";

const _worldQuat = new Quaternion();
const _parentInv = new Quaternion();

export function copyRotation(
	object: Object3D,
	quat: Quaternion,
	space: Object3D,
) {
	// 1. Get space's world rotation and combine it correctly.
	// This calculates: World Rotation = Space World Rotation * Target Quat
	_worldQuat
		.copy(quat)
		.premultiply(space.getWorldQuaternion(new Quaternion()));
	// Note: Using a fresh quat inside getWorldQuaternion to avoid overwriting our scratch pads early

	// 2. Extract parent's world inverse
	if (object.parent) {
		object.parent.getWorldQuaternion(_parentInv).invert();
	} else {
		_parentInv.identity();
	}

	// 3. Bring world rotation into the parent's local space.
	// Local Rotation = Parent Inverse * World Rotation
	object.quaternion.copy(_worldQuat.premultiply(_parentInv));
}
