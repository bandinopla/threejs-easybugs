import { Intersection, Object3D, Quaternion, Vector3 } from "three";
import { GroundPosition } from "./GroundPosition";

export type GroundSurfaceContext = {
	currentPos: GroundPosition;

	lastPos: GroundPosition;

	targetPos: GroundPosition;
	raycastCage?: Object3D;
	getRaycaster(): (from: Vector3, direction: Vector3) => Intersection[];
	object: Object3D;
};
