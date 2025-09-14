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
exports.id = "app/api/products/route";
exports.ids = ["app/api/products/route"];
exports.modules = {

/***/ "(rsc)/./app/api/products/route.ts":
/*!***********************************!*\
  !*** ./app/api/products/route.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET),\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var fs_promises__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! fs/promises */ \"fs/promises\");\n/* harmony import */ var fs_promises__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(fs_promises__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _app_utils_logger__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @/app/utils/logger */ \"(rsc)/./app/utils/logger.ts\");\n\n\n\n\nconst jsonFilePath = path__WEBPACK_IMPORTED_MODULE_2___default().resolve(process.cwd(), \"app/data/json/products.json\");\nasync function getProducts() {\n    try {\n        const data = await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().readFile(jsonFilePath, \"utf-8\");\n        return JSON.parse(data);\n    } catch (error) {\n        // If the file doesn't exist, return an empty array\n        if (error.code === 'ENOENT') {\n            return [];\n        }\n        throw error;\n    }\n}\nasync function saveProducts(products) {\n    await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().writeFile(jsonFilePath, JSON.stringify(products, null, 2));\n}\nasync function GET() {\n    const products = await getProducts();\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(products);\n}\nasync function POST(request) {\n    const newProduct = await request.json();\n    const products = await getProducts();\n    newProduct.id = Date.now().toString();\n    newProduct.createdAt = new Date().toISOString();\n    newProduct.updatedAt = new Date().toISOString();\n    products.push(newProduct);\n    await saveProducts(products);\n    (0,_app_utils_logger__WEBPACK_IMPORTED_MODULE_3__.logChange)(\"products.json\", `ACTION: CREATE - New product created: ${newProduct.name} (ID: ${newProduct.id})`);\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(newProduct, {\n        status: 201\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL3Byb2R1Y3RzL3JvdXRlLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQTJDO0FBQ2Q7QUFDTDtBQUN1QjtBQUUvQyxNQUFNSSxlQUFlRixtREFBWSxDQUFDSSxRQUFRQyxHQUFHLElBQUk7QUFFakQsZUFBZUM7SUFDYixJQUFJO1FBQ0YsTUFBTUMsT0FBTyxNQUFNUiwyREFBVyxDQUFDRyxjQUFjO1FBQzdDLE9BQU9PLEtBQUtDLEtBQUssQ0FBQ0g7SUFDcEIsRUFBRSxPQUFPSSxPQUFZO1FBQ25CLG1EQUFtRDtRQUNuRCxJQUFJQSxNQUFNQyxJQUFJLEtBQUssVUFBVTtZQUMzQixPQUFPLEVBQUU7UUFDWDtRQUNBLE1BQU1EO0lBQ1I7QUFDRjtBQUVBLGVBQWVFLGFBQWFDLFFBQWU7SUFDekMsTUFBTWYsNERBQVksQ0FBQ0csY0FBY08sS0FBS08sU0FBUyxDQUFDRixVQUFVLE1BQU07QUFDbEU7QUFFTyxlQUFlRztJQUNwQixNQUFNSCxXQUFXLE1BQU1SO0lBQ3ZCLE9BQU9SLHFEQUFZQSxDQUFDb0IsSUFBSSxDQUFDSjtBQUMzQjtBQUVPLGVBQWVLLEtBQUtDLE9BQWdCO0lBQ3pDLE1BQU1DLGFBQWEsTUFBTUQsUUFBUUYsSUFBSTtJQUNyQyxNQUFNSixXQUFXLE1BQU1SO0lBRXZCZSxXQUFXQyxFQUFFLEdBQUdDLEtBQUtDLEdBQUcsR0FBR0MsUUFBUTtJQUNuQ0osV0FBV0ssU0FBUyxHQUFHLElBQUlILE9BQU9JLFdBQVc7SUFDN0NOLFdBQVdPLFNBQVMsR0FBRyxJQUFJTCxPQUFPSSxXQUFXO0lBRTdDYixTQUFTZSxJQUFJLENBQUNSO0lBQ2QsTUFBTVIsYUFBYUM7SUFDbkJiLDREQUFTQSxDQUFDLGlCQUFpQixDQUFDLHNDQUFzQyxFQUFFb0IsV0FBV1MsSUFBSSxDQUFDLE1BQU0sRUFBRVQsV0FBV0MsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUU1RyxPQUFPeEIscURBQVlBLENBQUNvQixJQUFJLENBQUNHLFlBQVk7UUFBRVUsUUFBUTtJQUFJO0FBQ3JEIiwic291cmNlcyI6WyIvVXNlcnMvbWFoZW5kcmFyZWRkeS9kZXZlbG9wZXIvYmlsbGluZ19zeXN0ZW0vYmlsbGluZy1hcHAvYXBwL2FwaS9wcm9kdWN0cy9yb3V0ZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0UmVzcG9uc2UgfSBmcm9tIFwibmV4dC9zZXJ2ZXJcIjtcclxuaW1wb3J0IGZzIGZyb20gXCJmcy9wcm9taXNlc1wiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5pbXBvcnQgeyBsb2dDaGFuZ2UgfSBmcm9tIFwiQC9hcHAvdXRpbHMvbG9nZ2VyXCI7XHJcblxyXG5jb25zdCBqc29uRmlsZVBhdGggPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgXCJhcHAvZGF0YS9qc29uL3Byb2R1Y3RzLmpzb25cIik7XHJcblxyXG5hc3luYyBmdW5jdGlvbiBnZXRQcm9kdWN0cygpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IGZzLnJlYWRGaWxlKGpzb25GaWxlUGF0aCwgXCJ1dGYtOFwiKTtcclxuICAgIHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xyXG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgIC8vIElmIHRoZSBmaWxlIGRvZXNuJ3QgZXhpc3QsIHJldHVybiBhbiBlbXB0eSBhcnJheVxyXG4gICAgaWYgKGVycm9yLmNvZGUgPT09ICdFTk9FTlQnKSB7XHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gc2F2ZVByb2R1Y3RzKHByb2R1Y3RzOiBhbnlbXSkge1xyXG4gIGF3YWl0IGZzLndyaXRlRmlsZShqc29uRmlsZVBhdGgsIEpTT04uc3RyaW5naWZ5KHByb2R1Y3RzLCBudWxsLCAyKSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBHRVQoKSB7XHJcbiAgY29uc3QgcHJvZHVjdHMgPSBhd2FpdCBnZXRQcm9kdWN0cygpO1xyXG4gIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihwcm9kdWN0cyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBQT1NUKHJlcXVlc3Q6IFJlcXVlc3QpIHtcclxuICBjb25zdCBuZXdQcm9kdWN0ID0gYXdhaXQgcmVxdWVzdC5qc29uKCk7XHJcbiAgY29uc3QgcHJvZHVjdHMgPSBhd2FpdCBnZXRQcm9kdWN0cygpO1xyXG5cclxuICBuZXdQcm9kdWN0LmlkID0gRGF0ZS5ub3coKS50b1N0cmluZygpO1xyXG4gIG5ld1Byb2R1Y3QuY3JlYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gIG5ld1Byb2R1Y3QudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG5cclxuICBwcm9kdWN0cy5wdXNoKG5ld1Byb2R1Y3QpO1xyXG4gIGF3YWl0IHNhdmVQcm9kdWN0cyhwcm9kdWN0cyk7XHJcbiAgbG9nQ2hhbmdlKFwicHJvZHVjdHMuanNvblwiLCBgQUNUSU9OOiBDUkVBVEUgLSBOZXcgcHJvZHVjdCBjcmVhdGVkOiAke25ld1Byb2R1Y3QubmFtZX0gKElEOiAke25ld1Byb2R1Y3QuaWR9KWApO1xyXG5cclxuICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24obmV3UHJvZHVjdCwgeyBzdGF0dXM6IDIwMSB9KTtcclxufVxyXG4iXSwibmFtZXMiOlsiTmV4dFJlc3BvbnNlIiwiZnMiLCJwYXRoIiwibG9nQ2hhbmdlIiwianNvbkZpbGVQYXRoIiwicmVzb2x2ZSIsInByb2Nlc3MiLCJjd2QiLCJnZXRQcm9kdWN0cyIsImRhdGEiLCJyZWFkRmlsZSIsIkpTT04iLCJwYXJzZSIsImVycm9yIiwiY29kZSIsInNhdmVQcm9kdWN0cyIsInByb2R1Y3RzIiwid3JpdGVGaWxlIiwic3RyaW5naWZ5IiwiR0VUIiwianNvbiIsIlBPU1QiLCJyZXF1ZXN0IiwibmV3UHJvZHVjdCIsImlkIiwiRGF0ZSIsIm5vdyIsInRvU3RyaW5nIiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJwdXNoIiwibmFtZSIsInN0YXR1cyJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./app/api/products/route.ts\n");

/***/ }),

/***/ "(rsc)/./app/utils/logger.ts":
/*!*****************************!*\
  !*** ./app/utils/logger.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   createLog: () => (/* binding */ createLog),\n/* harmony export */   logChange: () => (/* binding */ logChange)\n/* harmony export */ });\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! fs */ \"fs\");\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_1__);\n\n\nconst logsDir = path__WEBPACK_IMPORTED_MODULE_1___default().join(process.cwd(), 'app', 'data', 'logs');\nif (!fs__WEBPACK_IMPORTED_MODULE_0___default().existsSync(logsDir)) {\n    fs__WEBPACK_IMPORTED_MODULE_0___default().mkdirSync(logsDir, {\n        recursive: true\n    });\n}\nconst logChange = (fileName, change)=>{\n    const logFilePath = path__WEBPACK_IMPORTED_MODULE_1___default().join(logsDir, `${fileName}.log`);\n    const timestamp = new Date().toISOString();\n    const logMessage = `${timestamp} - ${change}\\n`;\n    fs__WEBPACK_IMPORTED_MODULE_0___default().appendFileSync(logFilePath, logMessage);\n};\nconst createLog = async (logFilePath, content)=>{\n    await fs__WEBPACK_IMPORTED_MODULE_0___default().promises.writeFile(logFilePath, content, \"utf-8\");\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvdXRpbHMvbG9nZ2VyLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFvQjtBQUNJO0FBRXhCLE1BQU1FLFVBQVVELGdEQUFTLENBQUNHLFFBQVFDLEdBQUcsSUFBSSxPQUFPLFFBQVE7QUFFeEQsSUFBSSxDQUFDTCxvREFBYSxDQUFDRSxVQUFVO0lBQzNCRixtREFBWSxDQUFDRSxTQUFTO1FBQUVNLFdBQVc7SUFBSztBQUMxQztBQUVPLE1BQU1DLFlBQVksQ0FBQ0MsVUFBa0JDO0lBQzFDLE1BQU1DLGNBQWNYLGdEQUFTLENBQUNDLFNBQVMsR0FBR1EsU0FBUyxJQUFJLENBQUM7SUFDeEQsTUFBTUcsWUFBWSxJQUFJQyxPQUFPQyxXQUFXO0lBQ3hDLE1BQU1DLGFBQWEsR0FBR0gsVUFBVSxHQUFHLEVBQUVGLE9BQU8sRUFBRSxDQUFDO0lBRS9DWCx3REFBaUIsQ0FBQ1ksYUFBYUk7QUFDakMsRUFBRTtBQUVLLE1BQU1FLFlBQVksT0FBT04sYUFBcUJPO0lBQ25ELE1BQU1uQixrREFBVyxDQUFDcUIsU0FBUyxDQUFDVCxhQUFhTyxTQUFTO0FBQ3BELEVBQUUiLCJzb3VyY2VzIjpbIi9Vc2Vycy9tYWhlbmRyYXJlZGR5L2RldmVsb3Blci9iaWxsaW5nX3N5c3RlbS9iaWxsaW5nLWFwcC9hcHAvdXRpbHMvbG9nZ2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuY29uc3QgbG9nc0RpciA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnYXBwJywgJ2RhdGEnLCAnbG9ncycpO1xyXG5cclxuaWYgKCFmcy5leGlzdHNTeW5jKGxvZ3NEaXIpKSB7XHJcbiAgZnMubWtkaXJTeW5jKGxvZ3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgbG9nQ2hhbmdlID0gKGZpbGVOYW1lOiBzdHJpbmcsIGNoYW5nZTogc3RyaW5nKSA9PiB7XHJcbiAgY29uc3QgbG9nRmlsZVBhdGggPSBwYXRoLmpvaW4obG9nc0RpciwgYCR7ZmlsZU5hbWV9LmxvZ2ApO1xyXG4gIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICBjb25zdCBsb2dNZXNzYWdlID0gYCR7dGltZXN0YW1wfSAtICR7Y2hhbmdlfVxcbmA7XHJcblxyXG4gIGZzLmFwcGVuZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCBsb2dNZXNzYWdlKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBjcmVhdGVMb2cgPSBhc3luYyAobG9nRmlsZVBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKSA9PiB7XHJcbiAgYXdhaXQgZnMucHJvbWlzZXMud3JpdGVGaWxlKGxvZ0ZpbGVQYXRoLCBjb250ZW50LCBcInV0Zi04XCIpO1xyXG59O1xyXG4iXSwibmFtZXMiOlsiZnMiLCJwYXRoIiwibG9nc0RpciIsImpvaW4iLCJwcm9jZXNzIiwiY3dkIiwiZXhpc3RzU3luYyIsIm1rZGlyU3luYyIsInJlY3Vyc2l2ZSIsImxvZ0NoYW5nZSIsImZpbGVOYW1lIiwiY2hhbmdlIiwibG9nRmlsZVBhdGgiLCJ0aW1lc3RhbXAiLCJEYXRlIiwidG9JU09TdHJpbmciLCJsb2dNZXNzYWdlIiwiYXBwZW5kRmlsZVN5bmMiLCJjcmVhdGVMb2ciLCJjb250ZW50IiwicHJvbWlzZXMiLCJ3cml0ZUZpbGUiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/utils/logger.ts\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fproducts%2Froute&page=%2Fapi%2Fproducts%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fproducts%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fproducts%2Froute&page=%2Fapi%2Fproducts%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fproducts%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _Users_mahendrareddy_developer_billing_system_billing_app_app_api_products_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/products/route.ts */ \"(rsc)/./app/api/products/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/products/route\",\n        pathname: \"/api/products\",\n        filename: \"route\",\n        bundlePath: \"app/api/products/route\"\n    },\n    resolvedPagePath: \"/Users/mahendrareddy/developer/billing_system/billing-app/app/api/products/route.ts\",\n    nextConfigOutput,\n    userland: _Users_mahendrareddy_developer_billing_system_billing_app_app_api_products_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZwcm9kdWN0cyUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGcHJvZHVjdHMlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZwcm9kdWN0cyUyRnJvdXRlLnRzJmFwcERpcj0lMkZVc2VycyUyRm1haGVuZHJhcmVkZHklMkZkZXZlbG9wZXIlMkZiaWxsaW5nX3N5c3RlbSUyRmJpbGxpbmctYXBwJTJGYXBwJnBhZ2VFeHRlbnNpb25zPXRzeCZwYWdlRXh0ZW5zaW9ucz10cyZwYWdlRXh0ZW5zaW9ucz1qc3gmcGFnZUV4dGVuc2lvbnM9anMmcm9vdERpcj0lMkZVc2VycyUyRm1haGVuZHJhcmVkZHklMkZkZXZlbG9wZXIlMkZiaWxsaW5nX3N5c3RlbSUyRmJpbGxpbmctYXBwJmlzRGV2PXRydWUmdHNjb25maWdQYXRoPXRzY29uZmlnLmpzb24mYmFzZVBhdGg9JmFzc2V0UHJlZml4PSZuZXh0Q29uZmlnT3V0cHV0PSZwcmVmZXJyZWRSZWdpb249Jm1pZGRsZXdhcmVDb25maWc9ZTMwJTNEISIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7OztBQUErRjtBQUN2QztBQUNxQjtBQUNtQztBQUNoSDtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiL1VzZXJzL21haGVuZHJhcmVkZHkvZGV2ZWxvcGVyL2JpbGxpbmdfc3lzdGVtL2JpbGxpbmctYXBwL2FwcC9hcGkvcHJvZHVjdHMvcm91dGUudHNcIjtcbi8vIFdlIGluamVjdCB0aGUgbmV4dENvbmZpZ091dHB1dCBoZXJlIHNvIHRoYXQgd2UgY2FuIHVzZSB0aGVtIGluIHRoZSByb3V0ZVxuLy8gbW9kdWxlLlxuY29uc3QgbmV4dENvbmZpZ091dHB1dCA9IFwiXCJcbmNvbnN0IHJvdXRlTW9kdWxlID0gbmV3IEFwcFJvdXRlUm91dGVNb2R1bGUoe1xuICAgIGRlZmluaXRpb246IHtcbiAgICAgICAga2luZDogUm91dGVLaW5kLkFQUF9ST1VURSxcbiAgICAgICAgcGFnZTogXCIvYXBpL3Byb2R1Y3RzL3JvdXRlXCIsXG4gICAgICAgIHBhdGhuYW1lOiBcIi9hcGkvcHJvZHVjdHNcIixcbiAgICAgICAgZmlsZW5hbWU6IFwicm91dGVcIixcbiAgICAgICAgYnVuZGxlUGF0aDogXCJhcHAvYXBpL3Byb2R1Y3RzL3JvdXRlXCJcbiAgICB9LFxuICAgIHJlc29sdmVkUGFnZVBhdGg6IFwiL1VzZXJzL21haGVuZHJhcmVkZHkvZGV2ZWxvcGVyL2JpbGxpbmdfc3lzdGVtL2JpbGxpbmctYXBwL2FwcC9hcGkvcHJvZHVjdHMvcm91dGUudHNcIixcbiAgICBuZXh0Q29uZmlnT3V0cHV0LFxuICAgIHVzZXJsYW5kXG59KTtcbi8vIFB1bGwgb3V0IHRoZSBleHBvcnRzIHRoYXQgd2UgbmVlZCB0byBleHBvc2UgZnJvbSB0aGUgbW9kdWxlLiBUaGlzIHNob3VsZFxuLy8gYmUgZWxpbWluYXRlZCB3aGVuIHdlJ3ZlIG1vdmVkIHRoZSBvdGhlciByb3V0ZXMgdG8gdGhlIG5ldyBmb3JtYXQuIFRoZXNlXG4vLyBhcmUgdXNlZCB0byBob29rIGludG8gdGhlIHJvdXRlLlxuY29uc3QgeyB3b3JrQXN5bmNTdG9yYWdlLCB3b3JrVW5pdEFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MgfSA9IHJvdXRlTW9kdWxlO1xuZnVuY3Rpb24gcGF0Y2hGZXRjaCgpIHtcbiAgICByZXR1cm4gX3BhdGNoRmV0Y2goe1xuICAgICAgICB3b3JrQXN5bmNTdG9yYWdlLFxuICAgICAgICB3b3JrVW5pdEFzeW5jU3RvcmFnZVxuICAgIH0pO1xufVxuZXhwb3J0IHsgcm91dGVNb2R1bGUsIHdvcmtBc3luY1N0b3JhZ2UsIHdvcmtVbml0QXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fproducts%2Froute&page=%2Fapi%2Fproducts%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fproducts%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

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
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fproducts%2Froute&page=%2Fapi%2Fproducts%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fproducts%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();