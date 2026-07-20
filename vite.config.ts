import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
	base: "/threejs-easybugs/",
	root: path.resolve(__dirname, "demo"),
	resolve: {
		preserveSymlinks: false,
		alias: {
			"three/webgpu": path.resolve(
				__dirname,
				"node_modules/three/build/three.webgpu.js",
			),
			"three/tsl": path.resolve(
				__dirname,
				"node_modules/three/build/three.tsl.js",
			),

			"three/addons": path.resolve(
				__dirname,
				"node_modules/three/examples/jsm/Addons.js",
			),
			"three/addons/": path.resolve(
				__dirname,
				"node_modules/three/examples/jsm/",
			),

			"three/examples/jsm/": path.resolve(
				__dirname,
				"node_modules/three/examples/jsm/",
			),
			"three/examples/fonts/": path.resolve(
				__dirname,
				"node_modules/three/examples/fonts/",
			),

			"three/src/": path.resolve(__dirname, "node_modules/three/src/"),
			three: path.resolve(__dirname, "node_modules/three"),
			"threejs-easybugs": path.resolve(__dirname, "src/index.ts"),
		},
	},
	build: {
		outDir: path.resolve(__dirname, "dist-demo"),
		emptyOutDir: true,
	},
	server: {
		port: 3000,
		open: false,
	},

	// optimizeDeps: {
	// 	exclude: ["threejs-instancedanimatedmesh"],
	// },
});
