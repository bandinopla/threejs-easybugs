import { Bone } from "three";
import { GaitBone, GaitFunction } from "../BugIKLegs";

export const basicGait: GaitFunction = function* (bones: GaitBone[]) {
	let idx = 0;

	while (true) {
		bones[idx].canMove = true;
		yield;
		bones[idx].canMove = false;
		idx = (idx + 1) % bones.length;
	}
};
