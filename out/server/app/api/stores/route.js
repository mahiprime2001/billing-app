/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/stores/route";
exports.ids = ["app/api/stores/route"];
exports.modules = {

/***/ "(rsc)/./app/api/stores/route.ts":
/*!*********************************!*\
  !*** ./app/api/stores/route.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET),\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var fs_promises__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! fs/promises */ \"fs/promises\");\n/* harmony import */ var fs_promises__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(fs_promises__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _app_utils_logger__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @/app/utils/logger */ \"(rsc)/./app/utils/logger.ts\");\n\n\n\n\nconst jsonFilePath = path__WEBPACK_IMPORTED_MODULE_2___default().resolve(process.cwd(), \"app/data/json/stores.json\");\nasync function getStores() {\n    try {\n        const data = await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().readFile(jsonFilePath, \"utf-8\");\n        return JSON.parse(data);\n    } catch (error) {\n        if (error.code === 'ENOENT') {\n            return [];\n        }\n        throw error;\n    }\n}\nasync function saveStores(stores) {\n    await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().writeFile(jsonFilePath, JSON.stringify(stores, null, 2));\n}\nasync function GET() {\n    const stores = await getStores();\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(stores);\n}\nasync function POST(request) {\n    const newStore = await request.json();\n    const stores = await getStores();\n    const updatedStore = {\n        ...newStore,\n        id: `STR-${Date.now()}`,\n        createdAt: new Date().toISOString()\n    };\n    stores.push(updatedStore);\n    await saveStores(stores);\n    (0,_app_utils_logger__WEBPACK_IMPORTED_MODULE_3__.logChange)(\"stores.json\", `New store created: ${updatedStore.name} (ID: ${updatedStore.id})`);\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(updatedStore, {\n        status: 201\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL3N0b3Jlcy9yb3V0ZS50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUEyQztBQUNkO0FBQ0w7QUFDdUI7QUFFL0MsTUFBTUksZUFBZUYsbURBQVksQ0FBQ0ksUUFBUUMsR0FBRyxJQUFJO0FBRWpELGVBQWVDO0lBQ2IsSUFBSTtRQUNGLE1BQU1DLE9BQU8sTUFBTVIsMkRBQVcsQ0FBQ0csY0FBYztRQUM3QyxPQUFPTyxLQUFLQyxLQUFLLENBQUNIO0lBQ3BCLEVBQUUsT0FBT0ksT0FBWTtRQUNuQixJQUFJQSxNQUFNQyxJQUFJLEtBQUssVUFBVTtZQUMzQixPQUFPLEVBQUU7UUFDWDtRQUNBLE1BQU1EO0lBQ1I7QUFDRjtBQUVBLGVBQWVFLFdBQVdDLE1BQWE7SUFDckMsTUFBTWYsNERBQVksQ0FBQ0csY0FBY08sS0FBS08sU0FBUyxDQUFDRixRQUFRLE1BQU07QUFDaEU7QUFFTyxlQUFlRztJQUNwQixNQUFNSCxTQUFTLE1BQU1SO0lBQ3JCLE9BQU9SLHFEQUFZQSxDQUFDb0IsSUFBSSxDQUFDSjtBQUMzQjtBQUVPLGVBQWVLLEtBQUtDLE9BQWdCO0lBQ3pDLE1BQU1DLFdBQVcsTUFBTUQsUUFBUUYsSUFBSTtJQUNuQyxNQUFNSixTQUFTLE1BQU1SO0lBRXJCLE1BQU1nQixlQUFlO1FBQ25CLEdBQUdELFFBQVE7UUFDWEUsSUFBSSxDQUFDLElBQUksRUFBRUMsS0FBS0MsR0FBRyxJQUFJO1FBQ3ZCQyxXQUFXLElBQUlGLE9BQU9HLFdBQVc7SUFDbkM7SUFFQWIsT0FBT2MsSUFBSSxDQUFDTjtJQUNaLE1BQU1ULFdBQVdDO0lBQ2pCYiw0REFBU0EsQ0FBQyxlQUFlLENBQUMsbUJBQW1CLEVBQUVxQixhQUFhTyxJQUFJLENBQUMsTUFBTSxFQUFFUCxhQUFhQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRTNGLE9BQU96QixxREFBWUEsQ0FBQ29CLElBQUksQ0FBQ0ksY0FBYztRQUFFUSxRQUFRO0lBQUk7QUFDdkQiLCJzb3VyY2VzIjpbIkU6XFxiaWxsaW5nLWFwcFxcYXBwXFxhcGlcXHN0b3Jlc1xccm91dGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSBcIm5leHQvc2VydmVyXCI7XHJcbmltcG9ydCBmcyBmcm9tIFwiZnMvcHJvbWlzZXNcIjtcclxuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcclxuaW1wb3J0IHsgbG9nQ2hhbmdlIH0gZnJvbSBcIkAvYXBwL3V0aWxzL2xvZ2dlclwiO1xyXG5cclxuY29uc3QganNvbkZpbGVQYXRoID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIFwiYXBwL2RhdGEvanNvbi9zdG9yZXMuanNvblwiKTtcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFN0b3JlcygpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IGZzLnJlYWRGaWxlKGpzb25GaWxlUGF0aCwgXCJ1dGYtOFwiKTtcclxuICAgIHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xyXG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgIGlmIChlcnJvci5jb2RlID09PSAnRU5PRU5UJykge1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHNhdmVTdG9yZXMoc3RvcmVzOiBhbnlbXSkge1xyXG4gIGF3YWl0IGZzLndyaXRlRmlsZShqc29uRmlsZVBhdGgsIEpTT04uc3RyaW5naWZ5KHN0b3JlcywgbnVsbCwgMikpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gR0VUKCkge1xyXG4gIGNvbnN0IHN0b3JlcyA9IGF3YWl0IGdldFN0b3JlcygpO1xyXG4gIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihzdG9yZXMpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gUE9TVChyZXF1ZXN0OiBSZXF1ZXN0KSB7XHJcbiAgY29uc3QgbmV3U3RvcmUgPSBhd2FpdCByZXF1ZXN0Lmpzb24oKTtcclxuICBjb25zdCBzdG9yZXMgPSBhd2FpdCBnZXRTdG9yZXMoKTtcclxuICBcclxuICBjb25zdCB1cGRhdGVkU3RvcmUgPSB7XHJcbiAgICAuLi5uZXdTdG9yZSxcclxuICAgIGlkOiBgU1RSLSR7RGF0ZS5ub3coKX1gLFxyXG4gICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgfTtcclxuXHJcbiAgc3RvcmVzLnB1c2godXBkYXRlZFN0b3JlKTtcclxuICBhd2FpdCBzYXZlU3RvcmVzKHN0b3Jlcyk7XHJcbiAgbG9nQ2hhbmdlKFwic3RvcmVzLmpzb25cIiwgYE5ldyBzdG9yZSBjcmVhdGVkOiAke3VwZGF0ZWRTdG9yZS5uYW1lfSAoSUQ6ICR7dXBkYXRlZFN0b3JlLmlkfSlgKTtcclxuICBcclxuICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24odXBkYXRlZFN0b3JlLCB7IHN0YXR1czogMjAxIH0pO1xyXG59XHJcbiJdLCJuYW1lcyI6WyJOZXh0UmVzcG9uc2UiLCJmcyIsInBhdGgiLCJsb2dDaGFuZ2UiLCJqc29uRmlsZVBhdGgiLCJyZXNvbHZlIiwicHJvY2VzcyIsImN3ZCIsImdldFN0b3JlcyIsImRhdGEiLCJyZWFkRmlsZSIsIkpTT04iLCJwYXJzZSIsImVycm9yIiwiY29kZSIsInNhdmVTdG9yZXMiLCJzdG9yZXMiLCJ3cml0ZUZpbGUiLCJzdHJpbmdpZnkiLCJHRVQiLCJqc29uIiwiUE9TVCIsInJlcXVlc3QiLCJuZXdTdG9yZSIsInVwZGF0ZWRTdG9yZSIsImlkIiwiRGF0ZSIsIm5vdyIsImNyZWF0ZWRBdCIsInRvSVNPU3RyaW5nIiwicHVzaCIsIm5hbWUiLCJzdGF0dXMiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/api/stores/route.ts\n");

/***/ }),

/***/ "(rsc)/./app/utils/logger.ts":
/*!*****************************!*\
  !*** ./app/utils/logger.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   createLog: () => (/* binding */ createLog),\n/* harmony export */   logChange: () => (/* binding */ logChange)\n/* harmony export */ });\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! fs */ \"fs\");\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_1__);\n\n\nconst logsDir = path__WEBPACK_IMPORTED_MODULE_1___default().join(process.cwd(), 'app', 'data', 'logs');\nif (!fs__WEBPACK_IMPORTED_MODULE_0___default().existsSync(logsDir)) {\n    fs__WEBPACK_IMPORTED_MODULE_0___default().mkdirSync(logsDir, {\n        recursive: true\n    });\n}\nconst logChange = (fileName, change)=>{\n    const logFilePath = path__WEBPACK_IMPORTED_MODULE_1___default().join(logsDir, `${fileName}.log`);\n    const timestamp = new Date().toISOString();\n    const logMessage = `${timestamp} - ${change}\\n`;\n    fs__WEBPACK_IMPORTED_MODULE_0___default().appendFileSync(logFilePath, logMessage);\n};\nconst createLog = async (logFilePath, content)=>{\n    await fs__WEBPACK_IMPORTED_MODULE_0___default().promises.writeFile(logFilePath, content, \"utf-8\");\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvdXRpbHMvbG9nZ2VyLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFvQjtBQUNJO0FBRXhCLE1BQU1FLFVBQVVELGdEQUFTLENBQUNHLFFBQVFDLEdBQUcsSUFBSSxPQUFPLFFBQVE7QUFFeEQsSUFBSSxDQUFDTCxvREFBYSxDQUFDRSxVQUFVO0lBQzNCRixtREFBWSxDQUFDRSxTQUFTO1FBQUVNLFdBQVc7SUFBSztBQUMxQztBQUVPLE1BQU1DLFlBQVksQ0FBQ0MsVUFBa0JDO0lBQzFDLE1BQU1DLGNBQWNYLGdEQUFTLENBQUNDLFNBQVMsR0FBR1EsU0FBUyxJQUFJLENBQUM7SUFDeEQsTUFBTUcsWUFBWSxJQUFJQyxPQUFPQyxXQUFXO0lBQ3hDLE1BQU1DLGFBQWEsR0FBR0gsVUFBVSxHQUFHLEVBQUVGLE9BQU8sRUFBRSxDQUFDO0lBRS9DWCx3REFBaUIsQ0FBQ1ksYUFBYUk7QUFDakMsRUFBRTtBQUVLLE1BQU1FLFlBQVksT0FBT04sYUFBcUJPO0lBQ25ELE1BQU1uQixrREFBVyxDQUFDcUIsU0FBUyxDQUFDVCxhQUFhTyxTQUFTO0FBQ3BELEVBQUUiLCJzb3VyY2VzIjpbIkU6XFxiaWxsaW5nLWFwcFxcYXBwXFx1dGlsc1xcbG9nZ2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuY29uc3QgbG9nc0RpciA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnYXBwJywgJ2RhdGEnLCAnbG9ncycpO1xyXG5cclxuaWYgKCFmcy5leGlzdHNTeW5jKGxvZ3NEaXIpKSB7XHJcbiAgZnMubWtkaXJTeW5jKGxvZ3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgbG9nQ2hhbmdlID0gKGZpbGVOYW1lOiBzdHJpbmcsIGNoYW5nZTogc3RyaW5nKSA9PiB7XHJcbiAgY29uc3QgbG9nRmlsZVBhdGggPSBwYXRoLmpvaW4obG9nc0RpciwgYCR7ZmlsZU5hbWV9LmxvZ2ApO1xyXG4gIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICBjb25zdCBsb2dNZXNzYWdlID0gYCR7dGltZXN0YW1wfSAtICR7Y2hhbmdlfVxcbmA7XHJcblxyXG4gIGZzLmFwcGVuZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCBsb2dNZXNzYWdlKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBjcmVhdGVMb2cgPSBhc3luYyAobG9nRmlsZVBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKSA9PiB7XHJcbiAgYXdhaXQgZnMucHJvbWlzZXMud3JpdGVGaWxlKGxvZ0ZpbGVQYXRoLCBjb250ZW50LCBcInV0Zi04XCIpO1xyXG59O1xyXG4iXSwibmFtZXMiOlsiZnMiLCJwYXRoIiwibG9nc0RpciIsImpvaW4iLCJwcm9jZXNzIiwiY3dkIiwiZXhpc3RzU3luYyIsIm1rZGlyU3luYyIsInJlY3Vyc2l2ZSIsImxvZ0NoYW5nZSIsImZpbGVOYW1lIiwiY2hhbmdlIiwibG9nRmlsZVBhdGgiLCJ0aW1lc3RhbXAiLCJEYXRlIiwidG9JU09TdHJpbmciLCJsb2dNZXNzYWdlIiwiYXBwZW5kRmlsZVN5bmMiLCJjcmVhdGVMb2ciLCJjb250ZW50IiwicHJvbWlzZXMiLCJ3cml0ZUZpbGUiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/utils/logger.ts\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fstores%2Froute&page=%2Fapi%2Fstores%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fstores%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D!":
/*!**********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fstores%2Froute&page=%2Fapi%2Fstores%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fstores%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D! ***!
  \**********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var E_billing_app_app_api_stores_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/stores/route.ts */ \"(rsc)/./app/api/stores/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"export\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/stores/route\",\n        pathname: \"/api/stores\",\n        filename: \"route\",\n        bundlePath: \"app/api/stores/route\"\n    },\n    resolvedPagePath: \"E:\\\\billing-app\\\\app\\\\api\\\\stores\\\\route.ts\",\n    nextConfigOutput,\n    userland: E_billing_app_app_api_stores_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZzdG9yZXMlMkZyb3V0ZSZwYWdlPSUyRmFwaSUyRnN0b3JlcyUyRnJvdXRlJmFwcFBhdGhzPSZwYWdlUGF0aD1wcml2YXRlLW5leHQtYXBwLWRpciUyRmFwaSUyRnN0b3JlcyUyRnJvdXRlLnRzJmFwcERpcj1FJTNBJTVDYmlsbGluZy1hcHAlNUNhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPUUlM0ElNUNiaWxsaW5nLWFwcCZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD1leHBvcnQmcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBK0Y7QUFDdkM7QUFDcUI7QUFDTDtBQUN4RTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiRTpcXFxcYmlsbGluZy1hcHBcXFxcYXBwXFxcXGFwaVxcXFxzdG9yZXNcXFxccm91dGUudHNcIjtcbi8vIFdlIGluamVjdCB0aGUgbmV4dENvbmZpZ091dHB1dCBoZXJlIHNvIHRoYXQgd2UgY2FuIHVzZSB0aGVtIGluIHRoZSByb3V0ZVxuLy8gbW9kdWxlLlxuY29uc3QgbmV4dENvbmZpZ091dHB1dCA9IFwiZXhwb3J0XCJcbmNvbnN0IHJvdXRlTW9kdWxlID0gbmV3IEFwcFJvdXRlUm91dGVNb2R1bGUoe1xuICAgIGRlZmluaXRpb246IHtcbiAgICAgICAga2luZDogUm91dGVLaW5kLkFQUF9ST1VURSxcbiAgICAgICAgcGFnZTogXCIvYXBpL3N0b3Jlcy9yb3V0ZVwiLFxuICAgICAgICBwYXRobmFtZTogXCIvYXBpL3N0b3Jlc1wiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvc3RvcmVzL3JvdXRlXCJcbiAgICB9LFxuICAgIHJlc29sdmVkUGFnZVBhdGg6IFwiRTpcXFxcYmlsbGluZy1hcHBcXFxcYXBwXFxcXGFwaVxcXFxzdG9yZXNcXFxccm91dGUudHNcIixcbiAgICBuZXh0Q29uZmlnT3V0cHV0LFxuICAgIHVzZXJsYW5kXG59KTtcbi8vIFB1bGwgb3V0IHRoZSBleHBvcnRzIHRoYXQgd2UgbmVlZCB0byBleHBvc2UgZnJvbSB0aGUgbW9kdWxlLiBUaGlzIHNob3VsZFxuLy8gYmUgZWxpbWluYXRlZCB3aGVuIHdlJ3ZlIG1vdmVkIHRoZSBvdGhlciByb3V0ZXMgdG8gdGhlIG5ldyBmb3JtYXQuIFRoZXNlXG4vLyBhcmUgdXNlZCB0byBob29rIGludG8gdGhlIHJvdXRlLlxuY29uc3QgeyB3b3JrQXN5bmNTdG9yYWdlLCB3b3JrVW5pdEFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MgfSA9IHJvdXRlTW9kdWxlO1xuZnVuY3Rpb24gcGF0Y2hGZXRjaCgpIHtcbiAgICByZXR1cm4gX3BhdGNoRmV0Y2goe1xuICAgICAgICB3b3JrQXN5bmNTdG9yYWdlLFxuICAgICAgICB3b3JrVW5pdEFzeW5jU3RvcmFnZVxuICAgIH0pO1xufVxuZXhwb3J0IHsgcm91dGVNb2R1bGUsIHdvcmtBc3luY1N0b3JhZ2UsIHdvcmtVbml0QXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fstores%2Froute&page=%2Fapi%2Fstores%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fstores%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true!":
/*!******************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true! ***!
  \******************************************************************************************************/
/***/ (() => {



/***/ }),

/***/ "(ssr)/./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true!":
/*!******************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true! ***!
  \******************************************************************************************************/
/***/ (() => {



/***/ }),

/***/ "../app-render/after-task-async-storage.external":
/*!***********************************************************************************!*\
  !*** external "next/dist/server/app-render/after-task-async-storage.external.js" ***!
  \***********************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/after-task-async-storage.external.js");

/***/ }),

/***/ "../app-render/work-async-storage.external":
/*!*****************************************************************************!*\
  !*** external "next/dist/server/app-render/work-async-storage.external.js" ***!
  \*****************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/work-async-storage.external.js");

/***/ }),

/***/ "./work-unit-async-storage.external":
/*!**********************************************************************************!*\
  !*** external "next/dist/server/app-render/work-unit-async-storage.external.js" ***!
  \**********************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/work-unit-async-storage.external.js");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ "fs/promises":
/*!******************************!*\
  !*** external "fs/promises" ***!
  \******************************/
/***/ ((module) => {

"use strict";
module.exports = require("fs/promises");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fstores%2Froute&page=%2Fapi%2Fstores%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fstores%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();