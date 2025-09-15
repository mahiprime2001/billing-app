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
exports.id = "app/api/auth/login/route";
exports.ids = ["app/api/auth/login/route"];
exports.modules = {

/***/ "(rsc)/./app/api/auth/login/route.ts":
/*!*************************************!*\
  !*** ./app/api/auth/login/route.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var _app_utils_cipher__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @/app/utils/cipher */ \"(rsc)/./app/utils/cipher.ts\");\n/* harmony import */ var _app_data_json_users_json__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @/app/data/json/users.json */ \"(rsc)/./app/data/json/users.json\");\n\n\n\nasync function POST(request) {\n    const { email, password } = await request.json();\n    if (!email || !password) {\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            message: \"Email and password are required\"\n        }, {\n            status: 400\n        });\n    }\n    const user = _app_data_json_users_json__WEBPACK_IMPORTED_MODULE_2__.find((u)=>u.email.toLowerCase() === email.toLowerCase());\n    if (user) {\n        if (user.password !== password) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                message: \"Invalid email or password\"\n            }, {\n                status: 401\n            });\n        }\n    } else {\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            message: \"Invalid email or password\"\n        }, {\n            status: 401\n        });\n    }\n    // Do not send the password back to the client\n    const { password: _, ...userWithoutPassword } = user;\n    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now\n    ;\n    const sessionData = {\n        user: userWithoutPassword\n    };\n    const sessionValue = (0,_app_utils_cipher__WEBPACK_IMPORTED_MODULE_1__.encrypt)(JSON.stringify(sessionData));\n    const response = next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n        ...userWithoutPassword\n    });\n    response.cookies.set({\n        name: \"session\",\n        value: sessionValue,\n        httpOnly: true,\n        secure: \"development\" === \"production\",\n        expires: expiresAt,\n        sameSite: \"lax\",\n        path: \"/\"\n    });\n    return response;\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL2F1dGgvbG9naW4vcm91dGUudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUEwQztBQUNFO0FBRUc7QUFFeEMsZUFBZUcsS0FBS0MsT0FBZ0I7SUFDekMsTUFBTSxFQUFFQyxLQUFLLEVBQUVDLFFBQVEsRUFBRSxHQUFHLE1BQU1GLFFBQVFHLElBQUk7SUFFOUMsSUFBSSxDQUFDRixTQUFTLENBQUNDLFVBQVU7UUFDdkIsT0FBT04scURBQVlBLENBQUNPLElBQUksQ0FBQztZQUFFQyxTQUFTO1FBQWtDLEdBQUc7WUFBRUMsUUFBUTtRQUFJO0lBQ3pGO0lBRUEsTUFBTUMsT0FBT1Isc0RBQUtBLENBQUNTLElBQUksQ0FBQyxDQUFDQyxJQUFXQSxFQUFFUCxLQUFLLENBQUNRLFdBQVcsT0FBT1IsTUFBTVEsV0FBVztJQUUvRSxJQUFJSCxNQUFNO1FBQ1IsSUFBSUEsS0FBS0osUUFBUSxLQUFLQSxVQUFVO1lBQzlCLE9BQU9OLHFEQUFZQSxDQUFDTyxJQUFJLENBQUM7Z0JBQUVDLFNBQVM7WUFBNEIsR0FBRztnQkFBRUMsUUFBUTtZQUFJO1FBQ25GO0lBQ0YsT0FBTztRQUNMLE9BQU9ULHFEQUFZQSxDQUFDTyxJQUFJLENBQUM7WUFBRUMsU0FBUztRQUE0QixHQUFHO1lBQUVDLFFBQVE7UUFBSTtJQUNuRjtJQUVBLDhDQUE4QztJQUM5QyxNQUFNLEVBQUVILFVBQVVRLENBQUMsRUFBRSxHQUFHQyxxQkFBcUIsR0FBR0w7SUFFaEQsTUFBTU0sWUFBWSxJQUFJQyxLQUFLQSxLQUFLQyxHQUFHLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTSxtQkFBbUI7O0lBQy9FLE1BQU1DLGNBQWM7UUFDbEJULE1BQU1LO0lBQ1I7SUFFQSxNQUFNSyxlQUFlbkIsMERBQU9BLENBQUNvQixLQUFLQyxTQUFTLENBQUNIO0lBRTVDLE1BQU1JLFdBQVd2QixxREFBWUEsQ0FBQ08sSUFBSSxDQUFDO1FBQUUsR0FBR1EsbUJBQW1CO0lBQUM7SUFDNURRLFNBQVNDLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDO1FBQ25CQyxNQUFNO1FBQ05DLE9BQU9QO1FBQ1BRLFVBQVU7UUFDVkMsUUFBUUMsa0JBQXlCO1FBQ2pDQyxTQUFTZjtRQUNUZ0IsVUFBVTtRQUNWQyxNQUFNO0lBQ1I7SUFFQSxPQUFPVjtBQUNUIiwic291cmNlcyI6WyJFOlxcYmlsbGluZy1hcHBcXGFwcFxcYXBpXFxhdXRoXFxsb2dpblxccm91dGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSBcIm5leHQvc2VydmVyXCJcclxuaW1wb3J0IHsgZW5jcnlwdCB9IGZyb20gXCJAL2FwcC91dGlscy9jaXBoZXJcIlxyXG5cclxuaW1wb3J0IHVzZXJzIGZyb20gXCJAL2FwcC9kYXRhL2pzb24vdXNlcnMuanNvblwiO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIFBPU1QocmVxdWVzdDogUmVxdWVzdCkge1xyXG4gIGNvbnN0IHsgZW1haWwsIHBhc3N3b3JkIH0gPSBhd2FpdCByZXF1ZXN0Lmpzb24oKVxyXG5cclxuICBpZiAoIWVtYWlsIHx8ICFwYXNzd29yZCkge1xyXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgbWVzc2FnZTogXCJFbWFpbCBhbmQgcGFzc3dvcmQgYXJlIHJlcXVpcmVkXCIgfSwgeyBzdGF0dXM6IDQwMCB9KVxyXG4gIH1cclxuXHJcbiAgY29uc3QgdXNlciA9IHVzZXJzLmZpbmQoKHU6IGFueSkgPT4gdS5lbWFpbC50b0xvd2VyQ2FzZSgpID09PSBlbWFpbC50b0xvd2VyQ2FzZSgpKVxyXG5cclxuICBpZiAodXNlcikge1xyXG4gICAgaWYgKHVzZXIucGFzc3dvcmQgIT09IHBhc3N3b3JkKSB7XHJcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IG1lc3NhZ2U6IFwiSW52YWxpZCBlbWFpbCBvciBwYXNzd29yZFwiIH0sIHsgc3RhdHVzOiA0MDEgfSlcclxuICAgIH1cclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgbWVzc2FnZTogXCJJbnZhbGlkIGVtYWlsIG9yIHBhc3N3b3JkXCIgfSwgeyBzdGF0dXM6IDQwMSB9KVxyXG4gIH1cclxuXHJcbiAgLy8gRG8gbm90IHNlbmQgdGhlIHBhc3N3b3JkIGJhY2sgdG8gdGhlIGNsaWVudFxyXG4gIGNvbnN0IHsgcGFzc3dvcmQ6IF8sIC4uLnVzZXJXaXRob3V0UGFzc3dvcmQgfSA9IHVzZXJcclxuXHJcbiAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoRGF0ZS5ub3coKSArIDIgKiA2MCAqIDYwICogMTAwMCkgLy8gMiBob3VycyBmcm9tIG5vd1xyXG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xyXG4gICAgdXNlcjogdXNlcldpdGhvdXRQYXNzd29yZCxcclxuICB9XHJcblxyXG4gIGNvbnN0IHNlc3Npb25WYWx1ZSA9IGVuY3J5cHQoSlNPTi5zdHJpbmdpZnkoc2Vzc2lvbkRhdGEpKVxyXG5cclxuICBjb25zdCByZXNwb25zZSA9IE5leHRSZXNwb25zZS5qc29uKHsgLi4udXNlcldpdGhvdXRQYXNzd29yZCB9KVxyXG4gIHJlc3BvbnNlLmNvb2tpZXMuc2V0KHtcclxuICAgIG5hbWU6IFwic2Vzc2lvblwiLFxyXG4gICAgdmFsdWU6IHNlc3Npb25WYWx1ZSxcclxuICAgIGh0dHBPbmx5OiB0cnVlLFxyXG4gICAgc2VjdXJlOiBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gXCJwcm9kdWN0aW9uXCIsXHJcbiAgICBleHBpcmVzOiBleHBpcmVzQXQsXHJcbiAgICBzYW1lU2l0ZTogXCJsYXhcIixcclxuICAgIHBhdGg6IFwiL1wiLFxyXG4gIH0pXHJcblxyXG4gIHJldHVybiByZXNwb25zZVxyXG59XHJcbiJdLCJuYW1lcyI6WyJOZXh0UmVzcG9uc2UiLCJlbmNyeXB0IiwidXNlcnMiLCJQT1NUIiwicmVxdWVzdCIsImVtYWlsIiwicGFzc3dvcmQiLCJqc29uIiwibWVzc2FnZSIsInN0YXR1cyIsInVzZXIiLCJmaW5kIiwidSIsInRvTG93ZXJDYXNlIiwiXyIsInVzZXJXaXRob3V0UGFzc3dvcmQiLCJleHBpcmVzQXQiLCJEYXRlIiwibm93Iiwic2Vzc2lvbkRhdGEiLCJzZXNzaW9uVmFsdWUiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2UiLCJjb29raWVzIiwic2V0IiwibmFtZSIsInZhbHVlIiwiaHR0cE9ubHkiLCJzZWN1cmUiLCJwcm9jZXNzIiwiZXhwaXJlcyIsInNhbWVTaXRlIiwicGF0aCJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./app/api/auth/login/route.ts\n");

/***/ }),

/***/ "(rsc)/./app/data/json/users.json":
/*!**********************************!*\
  !*** ./app/data/json/users.json ***!
  \**********************************/
/***/ ((module) => {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('[{"id":"1","name":"Super Admin","email":"admin@siriart.com","password":"admin123","role":"super_admin","status":"active","sessionDuration":null,"createdAt":"2022-12-31T13:00:00.000Z","updatedAt":"2022-12-31T18:30:00.000Z","lastLogin":null,"lastLogout":null,"totalSessionDuration":0}]');

/***/ }),

/***/ "(rsc)/./app/utils/cipher.ts":
/*!*****************************!*\
  !*** ./app/utils/cipher.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   decrypt: () => (/* binding */ decrypt),\n/* harmony export */   encrypt: () => (/* binding */ encrypt)\n/* harmony export */ });\nconst encrypt = (text)=>{\n    return text;\n};\nconst decrypt = (ciphertext)=>{\n    return ciphertext;\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvdXRpbHMvY2lwaGVyLnRzIiwibWFwcGluZ3MiOiI7Ozs7O0FBQU8sTUFBTUEsVUFBVSxDQUFDQztJQUN0QixPQUFPQTtBQUNULEVBQUU7QUFFSyxNQUFNQyxVQUFVLENBQUNDO0lBQ3RCLE9BQU9BO0FBQ1QsRUFBRSIsInNvdXJjZXMiOlsiRTpcXGJpbGxpbmctYXBwXFxhcHBcXHV0aWxzXFxjaXBoZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IGVuY3J5cHQgPSAodGV4dDogc3RyaW5nKSA9PiB7XHJcbiAgcmV0dXJuIHRleHQ7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgZGVjcnlwdCA9IChjaXBoZXJ0ZXh0OiBzdHJpbmcpID0+IHtcclxuICByZXR1cm4gY2lwaGVydGV4dDtcclxufTtcclxuIl0sIm5hbWVzIjpbImVuY3J5cHQiLCJ0ZXh0IiwiZGVjcnlwdCIsImNpcGhlcnRleHQiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/utils/cipher.ts\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fauth%2Flogin%2Froute&page=%2Fapi%2Fauth%2Flogin%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Flogin%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D!":
/*!****************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fauth%2Flogin%2Froute&page=%2Fapi%2Fauth%2Flogin%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Flogin%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D! ***!
  \****************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var E_billing_app_app_api_auth_login_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/auth/login/route.ts */ \"(rsc)/./app/api/auth/login/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"export\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/auth/login/route\",\n        pathname: \"/api/auth/login\",\n        filename: \"route\",\n        bundlePath: \"app/api/auth/login/route\"\n    },\n    resolvedPagePath: \"E:\\\\billing-app\\\\app\\\\api\\\\auth\\\\login\\\\route.ts\",\n    nextConfigOutput,\n    userland: E_billing_app_app_api_auth_login_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZhdXRoJTJGbG9naW4lMkZyb3V0ZSZwYWdlPSUyRmFwaSUyRmF1dGglMkZsb2dpbiUyRnJvdXRlJmFwcFBhdGhzPSZwYWdlUGF0aD1wcml2YXRlLW5leHQtYXBwLWRpciUyRmFwaSUyRmF1dGglMkZsb2dpbiUyRnJvdXRlLnRzJmFwcERpcj1FJTNBJTVDYmlsbGluZy1hcHAlNUNhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPUUlM0ElNUNiaWxsaW5nLWFwcCZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD1leHBvcnQmcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBK0Y7QUFDdkM7QUFDcUI7QUFDQTtBQUM3RTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiRTpcXFxcYmlsbGluZy1hcHBcXFxcYXBwXFxcXGFwaVxcXFxhdXRoXFxcXGxvZ2luXFxcXHJvdXRlLnRzXCI7XG4vLyBXZSBpbmplY3QgdGhlIG5leHRDb25maWdPdXRwdXQgaGVyZSBzbyB0aGF0IHdlIGNhbiB1c2UgdGhlbSBpbiB0aGUgcm91dGVcbi8vIG1vZHVsZS5cbmNvbnN0IG5leHRDb25maWdPdXRwdXQgPSBcImV4cG9ydFwiXG5jb25zdCByb3V0ZU1vZHVsZSA9IG5ldyBBcHBSb3V0ZVJvdXRlTW9kdWxlKHtcbiAgICBkZWZpbml0aW9uOiB7XG4gICAgICAgIGtpbmQ6IFJvdXRlS2luZC5BUFBfUk9VVEUsXG4gICAgICAgIHBhZ2U6IFwiL2FwaS9hdXRoL2xvZ2luL3JvdXRlXCIsXG4gICAgICAgIHBhdGhuYW1lOiBcIi9hcGkvYXV0aC9sb2dpblwiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvYXV0aC9sb2dpbi9yb3V0ZVwiXG4gICAgfSxcbiAgICByZXNvbHZlZFBhZ2VQYXRoOiBcIkU6XFxcXGJpbGxpbmctYXBwXFxcXGFwcFxcXFxhcGlcXFxcYXV0aFxcXFxsb2dpblxcXFxyb3V0ZS50c1wiLFxuICAgIG5leHRDb25maWdPdXRwdXQsXG4gICAgdXNlcmxhbmRcbn0pO1xuLy8gUHVsbCBvdXQgdGhlIGV4cG9ydHMgdGhhdCB3ZSBuZWVkIHRvIGV4cG9zZSBmcm9tIHRoZSBtb2R1bGUuIFRoaXMgc2hvdWxkXG4vLyBiZSBlbGltaW5hdGVkIHdoZW4gd2UndmUgbW92ZWQgdGhlIG90aGVyIHJvdXRlcyB0byB0aGUgbmV3IGZvcm1hdC4gVGhlc2Vcbi8vIGFyZSB1c2VkIHRvIGhvb2sgaW50byB0aGUgcm91dGUuXG5jb25zdCB7IHdvcmtBc3luY1N0b3JhZ2UsIHdvcmtVbml0QXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcyB9ID0gcm91dGVNb2R1bGU7XG5mdW5jdGlvbiBwYXRjaEZldGNoKCkge1xuICAgIHJldHVybiBfcGF0Y2hGZXRjaCh7XG4gICAgICAgIHdvcmtBc3luY1N0b3JhZ2UsXG4gICAgICAgIHdvcmtVbml0QXN5bmNTdG9yYWdlXG4gICAgfSk7XG59XG5leHBvcnQgeyByb3V0ZU1vZHVsZSwgd29ya0FzeW5jU3RvcmFnZSwgd29ya1VuaXRBc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzLCBwYXRjaEZldGNoLCAgfTtcblxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YXBwLXJvdXRlLmpzLm1hcCJdLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fauth%2Flogin%2Froute&page=%2Fapi%2Fauth%2Flogin%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Flogin%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D!\n");

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

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fauth%2Flogin%2Froute&page=%2Fapi%2Fauth%2Flogin%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Flogin%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();