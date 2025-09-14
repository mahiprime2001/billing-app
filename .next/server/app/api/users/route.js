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
exports.id = "app/api/users/route";
exports.ids = ["app/api/users/route"];
exports.modules = {

/***/ "(rsc)/./app/api/users/route.ts":
/*!********************************!*\
  !*** ./app/api/users/route.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET),\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! fs */ \"fs\");\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _app_utils_logger__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @/app/utils/logger */ \"(rsc)/./app/utils/logger.ts\");\n\n\n\n\nconst usersFilePath = path__WEBPACK_IMPORTED_MODULE_2___default().join(process.cwd(), \"app/data/json/users.json\");\n// Function to read users from the JSON file\nconst readUsers = ()=>{\n    try {\n        const usersData = fs__WEBPACK_IMPORTED_MODULE_1___default().readFileSync(usersFilePath, \"utf-8\");\n        return JSON.parse(usersData);\n    } catch (error) {\n        console.error(\"Error reading users file:\", error);\n        return [];\n    }\n};\n// Function to write users to the JSON file\nconst writeUsers = (users)=>{\n    try {\n        fs__WEBPACK_IMPORTED_MODULE_1___default().writeFileSync(usersFilePath, JSON.stringify(users, null, 2));\n    } catch (error) {\n        console.error(\"Error writing users file:\", error);\n    }\n};\nasync function GET() {\n    const users = readUsers();\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(users);\n}\nasync function POST(request) {\n    const newUser = await request.json();\n    const users = readUsers();\n    // Basic validation\n    if (!newUser.name || !newUser.email || !newUser.password) {\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            message: \"Missing required fields\"\n        }, {\n            status: 400\n        });\n    }\n    // Check for duplicate email\n    if (users.some((user)=>user.email === newUser.email)) {\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            message: \"Email already exists\"\n        }, {\n            status: 409\n        });\n    }\n    const userWithDefaults = {\n        id: Date.now().toString(),\n        ...newUser,\n        password: newUser.password,\n        createdAt: new Date().toISOString(),\n        updatedAt: new Date().toISOString()\n    };\n    users.push(userWithDefaults);\n    writeUsers(users);\n    (0,_app_utils_logger__WEBPACK_IMPORTED_MODULE_3__.logChange)(\"users.json\", `New user created: ${userWithDefaults.name} (ID: ${userWithDefaults.id})`);\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(userWithDefaults, {\n        status: 201\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL3VzZXJzL3JvdXRlLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQTBDO0FBQ3ZCO0FBQ0k7QUFFd0I7QUFFL0MsTUFBTUksZ0JBQWdCRixnREFBUyxDQUFDSSxRQUFRQyxHQUFHLElBQUk7QUFFL0MsNENBQTRDO0FBQzVDLE1BQU1DLFlBQVk7SUFDaEIsSUFBSTtRQUNGLE1BQU1DLFlBQVlSLHNEQUFlLENBQUNHLGVBQWU7UUFDakQsT0FBT08sS0FBS0MsS0FBSyxDQUFDSDtJQUNwQixFQUFFLE9BQU9JLE9BQU87UUFDZEMsUUFBUUQsS0FBSyxDQUFDLDZCQUE2QkE7UUFDM0MsT0FBTyxFQUFFO0lBQ1g7QUFDRjtBQUVBLDJDQUEyQztBQUMzQyxNQUFNRSxhQUFhLENBQUNDO0lBQ2xCLElBQUk7UUFDRmYsdURBQWdCLENBQUNHLGVBQWVPLEtBQUtPLFNBQVMsQ0FBQ0YsT0FBTyxNQUFNO0lBQzlELEVBQUUsT0FBT0gsT0FBTztRQUNkQyxRQUFRRCxLQUFLLENBQUMsNkJBQTZCQTtJQUM3QztBQUNGO0FBRU8sZUFBZU07SUFDcEIsTUFBTUgsUUFBUVI7SUFDZCxPQUFPUixxREFBWUEsQ0FBQ29CLElBQUksQ0FBQ0o7QUFDM0I7QUFFTyxlQUFlSyxLQUFLQyxPQUFnQjtJQUN6QyxNQUFNQyxVQUFVLE1BQU1ELFFBQVFGLElBQUk7SUFDbEMsTUFBTUosUUFBUVI7SUFFZCxtQkFBbUI7SUFDbkIsSUFBSSxDQUFDZSxRQUFRQyxJQUFJLElBQUksQ0FBQ0QsUUFBUUUsS0FBSyxJQUFJLENBQUNGLFFBQVFHLFFBQVEsRUFBRTtRQUN4RCxPQUFPMUIscURBQVlBLENBQUNvQixJQUFJLENBQUM7WUFBRU8sU0FBUztRQUEwQixHQUFHO1lBQUVDLFFBQVE7UUFBSTtJQUNqRjtJQUVBLDRCQUE0QjtJQUM1QixJQUFJWixNQUFNYSxJQUFJLENBQUMsQ0FBQ0MsT0FBY0EsS0FBS0wsS0FBSyxLQUFLRixRQUFRRSxLQUFLLEdBQUc7UUFDM0QsT0FBT3pCLHFEQUFZQSxDQUFDb0IsSUFBSSxDQUFDO1lBQUVPLFNBQVM7UUFBdUIsR0FBRztZQUFFQyxRQUFRO1FBQUk7SUFDOUU7SUFFQSxNQUFNRyxtQkFBbUI7UUFDdkJDLElBQUlDLEtBQUtDLEdBQUcsR0FBR0MsUUFBUTtRQUN2QixHQUFHWixPQUFPO1FBQ1ZHLFVBQVVILFFBQVFHLFFBQVE7UUFDMUJVLFdBQVcsSUFBSUgsT0FBT0ksV0FBVztRQUNqQ0MsV0FBVyxJQUFJTCxPQUFPSSxXQUFXO0lBQ25DO0lBRUFyQixNQUFNdUIsSUFBSSxDQUFDUjtJQUNYaEIsV0FBV0M7SUFDWGIsNERBQVNBLENBQUMsY0FBYyxDQUFDLGtCQUFrQixFQUFFNEIsaUJBQWlCUCxJQUFJLENBQUMsTUFBTSxFQUFFTyxpQkFBaUJDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFakcsT0FBT2hDLHFEQUFZQSxDQUFDb0IsSUFBSSxDQUFDVyxrQkFBa0I7UUFBRUgsUUFBUTtJQUFJO0FBQzNEIiwic291cmNlcyI6WyIvVXNlcnMvbWFoZW5kcmFyZWRkeS9kZXZlbG9wZXIvYmlsbGluZ19zeXN0ZW0vYmlsbGluZy1hcHAvYXBwL2FwaS91c2Vycy9yb3V0ZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0UmVzcG9uc2UgfSBmcm9tIFwibmV4dC9zZXJ2ZXJcIlxyXG5pbXBvcnQgZnMgZnJvbSBcImZzXCJcclxuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIlxyXG5pbXBvcnQgeyBlbmNyeXB0IH0gZnJvbSBcIkAvYXBwL3V0aWxzL2NpcGhlclwiXHJcbmltcG9ydCB7IGxvZ0NoYW5nZSB9IGZyb20gXCJAL2FwcC91dGlscy9sb2dnZXJcIjtcclxuXHJcbmNvbnN0IHVzZXJzRmlsZVBhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgXCJhcHAvZGF0YS9qc29uL3VzZXJzLmpzb25cIilcclxuXHJcbi8vIEZ1bmN0aW9uIHRvIHJlYWQgdXNlcnMgZnJvbSB0aGUgSlNPTiBmaWxlXHJcbmNvbnN0IHJlYWRVc2VycyA9ICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgdXNlcnNEYXRhID0gZnMucmVhZEZpbGVTeW5jKHVzZXJzRmlsZVBhdGgsIFwidXRmLThcIilcclxuICAgIHJldHVybiBKU09OLnBhcnNlKHVzZXJzRGF0YSlcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihcIkVycm9yIHJlYWRpbmcgdXNlcnMgZmlsZTpcIiwgZXJyb3IpXHJcbiAgICByZXR1cm4gW11cclxuICB9XHJcbn1cclxuXHJcbi8vIEZ1bmN0aW9uIHRvIHdyaXRlIHVzZXJzIHRvIHRoZSBKU09OIGZpbGVcclxuY29uc3Qgd3JpdGVVc2VycyA9ICh1c2VyczogYW55KSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGZzLndyaXRlRmlsZVN5bmModXNlcnNGaWxlUGF0aCwgSlNPTi5zdHJpbmdpZnkodXNlcnMsIG51bGwsIDIpKVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKFwiRXJyb3Igd3JpdGluZyB1c2VycyBmaWxlOlwiLCBlcnJvcilcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBHRVQoKSB7XHJcbiAgY29uc3QgdXNlcnMgPSByZWFkVXNlcnMoKVxyXG4gIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih1c2VycylcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIFBPU1QocmVxdWVzdDogUmVxdWVzdCkge1xyXG4gIGNvbnN0IG5ld1VzZXIgPSBhd2FpdCByZXF1ZXN0Lmpzb24oKVxyXG4gIGNvbnN0IHVzZXJzID0gcmVhZFVzZXJzKClcclxuXHJcbiAgLy8gQmFzaWMgdmFsaWRhdGlvblxyXG4gIGlmICghbmV3VXNlci5uYW1lIHx8ICFuZXdVc2VyLmVtYWlsIHx8ICFuZXdVc2VyLnBhc3N3b3JkKSB7XHJcbiAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBtZXNzYWdlOiBcIk1pc3NpbmcgcmVxdWlyZWQgZmllbGRzXCIgfSwgeyBzdGF0dXM6IDQwMCB9KVxyXG4gIH1cclxuXHJcbiAgLy8gQ2hlY2sgZm9yIGR1cGxpY2F0ZSBlbWFpbFxyXG4gIGlmICh1c2Vycy5zb21lKCh1c2VyOiBhbnkpID0+IHVzZXIuZW1haWwgPT09IG5ld1VzZXIuZW1haWwpKSB7XHJcbiAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBtZXNzYWdlOiBcIkVtYWlsIGFscmVhZHkgZXhpc3RzXCIgfSwgeyBzdGF0dXM6IDQwOSB9KVxyXG4gIH1cclxuXHJcbiAgY29uc3QgdXNlcldpdGhEZWZhdWx0cyA9IHtcclxuICAgIGlkOiBEYXRlLm5vdygpLnRvU3RyaW5nKCksXHJcbiAgICAuLi5uZXdVc2VyLFxyXG4gICAgcGFzc3dvcmQ6IG5ld1VzZXIucGFzc3dvcmQsXHJcbiAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gIH1cclxuXHJcbiAgdXNlcnMucHVzaCh1c2VyV2l0aERlZmF1bHRzKVxyXG4gIHdyaXRlVXNlcnModXNlcnMpXHJcbiAgbG9nQ2hhbmdlKFwidXNlcnMuanNvblwiLCBgTmV3IHVzZXIgY3JlYXRlZDogJHt1c2VyV2l0aERlZmF1bHRzLm5hbWV9IChJRDogJHt1c2VyV2l0aERlZmF1bHRzLmlkfSlgKTtcclxuXHJcbiAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHVzZXJXaXRoRGVmYXVsdHMsIHsgc3RhdHVzOiAyMDEgfSlcclxufVxyXG4iXSwibmFtZXMiOlsiTmV4dFJlc3BvbnNlIiwiZnMiLCJwYXRoIiwibG9nQ2hhbmdlIiwidXNlcnNGaWxlUGF0aCIsImpvaW4iLCJwcm9jZXNzIiwiY3dkIiwicmVhZFVzZXJzIiwidXNlcnNEYXRhIiwicmVhZEZpbGVTeW5jIiwiSlNPTiIsInBhcnNlIiwiZXJyb3IiLCJjb25zb2xlIiwid3JpdGVVc2VycyIsInVzZXJzIiwid3JpdGVGaWxlU3luYyIsInN0cmluZ2lmeSIsIkdFVCIsImpzb24iLCJQT1NUIiwicmVxdWVzdCIsIm5ld1VzZXIiLCJuYW1lIiwiZW1haWwiLCJwYXNzd29yZCIsIm1lc3NhZ2UiLCJzdGF0dXMiLCJzb21lIiwidXNlciIsInVzZXJXaXRoRGVmYXVsdHMiLCJpZCIsIkRhdGUiLCJub3ciLCJ0b1N0cmluZyIsImNyZWF0ZWRBdCIsInRvSVNPU3RyaW5nIiwidXBkYXRlZEF0IiwicHVzaCJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./app/api/users/route.ts\n");

/***/ }),

/***/ "(rsc)/./app/utils/logger.ts":
/*!*****************************!*\
  !*** ./app/utils/logger.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   createLog: () => (/* binding */ createLog),\n/* harmony export */   logChange: () => (/* binding */ logChange)\n/* harmony export */ });\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! fs */ \"fs\");\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_1__);\n\n\nconst logsDir = path__WEBPACK_IMPORTED_MODULE_1___default().join(process.cwd(), 'app', 'data', 'logs');\nif (!fs__WEBPACK_IMPORTED_MODULE_0___default().existsSync(logsDir)) {\n    fs__WEBPACK_IMPORTED_MODULE_0___default().mkdirSync(logsDir, {\n        recursive: true\n    });\n}\nconst logChange = (fileName, change)=>{\n    const logFilePath = path__WEBPACK_IMPORTED_MODULE_1___default().join(logsDir, `${fileName}.log`);\n    const timestamp = new Date().toISOString();\n    const logMessage = `${timestamp} - ${change}\\n`;\n    fs__WEBPACK_IMPORTED_MODULE_0___default().appendFileSync(logFilePath, logMessage);\n};\nconst createLog = async (logFilePath, content)=>{\n    await fs__WEBPACK_IMPORTED_MODULE_0___default().promises.writeFile(logFilePath, content, \"utf-8\");\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvdXRpbHMvbG9nZ2VyLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFvQjtBQUNJO0FBRXhCLE1BQU1FLFVBQVVELGdEQUFTLENBQUNHLFFBQVFDLEdBQUcsSUFBSSxPQUFPLFFBQVE7QUFFeEQsSUFBSSxDQUFDTCxvREFBYSxDQUFDRSxVQUFVO0lBQzNCRixtREFBWSxDQUFDRSxTQUFTO1FBQUVNLFdBQVc7SUFBSztBQUMxQztBQUVPLE1BQU1DLFlBQVksQ0FBQ0MsVUFBa0JDO0lBQzFDLE1BQU1DLGNBQWNYLGdEQUFTLENBQUNDLFNBQVMsR0FBR1EsU0FBUyxJQUFJLENBQUM7SUFDeEQsTUFBTUcsWUFBWSxJQUFJQyxPQUFPQyxXQUFXO0lBQ3hDLE1BQU1DLGFBQWEsR0FBR0gsVUFBVSxHQUFHLEVBQUVGLE9BQU8sRUFBRSxDQUFDO0lBRS9DWCx3REFBaUIsQ0FBQ1ksYUFBYUk7QUFDakMsRUFBRTtBQUVLLE1BQU1FLFlBQVksT0FBT04sYUFBcUJPO0lBQ25ELE1BQU1uQixrREFBVyxDQUFDcUIsU0FBUyxDQUFDVCxhQUFhTyxTQUFTO0FBQ3BELEVBQUUiLCJzb3VyY2VzIjpbIi9Vc2Vycy9tYWhlbmRyYXJlZGR5L2RldmVsb3Blci9iaWxsaW5nX3N5c3RlbS9iaWxsaW5nLWFwcC9hcHAvdXRpbHMvbG9nZ2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuY29uc3QgbG9nc0RpciA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnYXBwJywgJ2RhdGEnLCAnbG9ncycpO1xyXG5cclxuaWYgKCFmcy5leGlzdHNTeW5jKGxvZ3NEaXIpKSB7XHJcbiAgZnMubWtkaXJTeW5jKGxvZ3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgbG9nQ2hhbmdlID0gKGZpbGVOYW1lOiBzdHJpbmcsIGNoYW5nZTogc3RyaW5nKSA9PiB7XHJcbiAgY29uc3QgbG9nRmlsZVBhdGggPSBwYXRoLmpvaW4obG9nc0RpciwgYCR7ZmlsZU5hbWV9LmxvZ2ApO1xyXG4gIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICBjb25zdCBsb2dNZXNzYWdlID0gYCR7dGltZXN0YW1wfSAtICR7Y2hhbmdlfVxcbmA7XHJcblxyXG4gIGZzLmFwcGVuZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCBsb2dNZXNzYWdlKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBjcmVhdGVMb2cgPSBhc3luYyAobG9nRmlsZVBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKSA9PiB7XHJcbiAgYXdhaXQgZnMucHJvbWlzZXMud3JpdGVGaWxlKGxvZ0ZpbGVQYXRoLCBjb250ZW50LCBcInV0Zi04XCIpO1xyXG59O1xyXG4iXSwibmFtZXMiOlsiZnMiLCJwYXRoIiwibG9nc0RpciIsImpvaW4iLCJwcm9jZXNzIiwiY3dkIiwiZXhpc3RzU3luYyIsIm1rZGlyU3luYyIsInJlY3Vyc2l2ZSIsImxvZ0NoYW5nZSIsImZpbGVOYW1lIiwiY2hhbmdlIiwibG9nRmlsZVBhdGgiLCJ0aW1lc3RhbXAiLCJEYXRlIiwidG9JU09TdHJpbmciLCJsb2dNZXNzYWdlIiwiYXBwZW5kRmlsZVN5bmMiLCJjcmVhdGVMb2ciLCJjb250ZW50IiwicHJvbWlzZXMiLCJ3cml0ZUZpbGUiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/utils/logger.ts\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fusers%2Froute&page=%2Fapi%2Fusers%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fusers%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!***************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fusers%2Froute&page=%2Fapi%2Fusers%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fusers%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \***************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _Users_mahendrareddy_developer_billing_system_billing_app_app_api_users_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/users/route.ts */ \"(rsc)/./app/api/users/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/users/route\",\n        pathname: \"/api/users\",\n        filename: \"route\",\n        bundlePath: \"app/api/users/route\"\n    },\n    resolvedPagePath: \"/Users/mahendrareddy/developer/billing_system/billing-app/app/api/users/route.ts\",\n    nextConfigOutput,\n    userland: _Users_mahendrareddy_developer_billing_system_billing_app_app_api_users_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZ1c2VycyUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGdXNlcnMlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZ1c2VycyUyRnJvdXRlLnRzJmFwcERpcj0lMkZVc2VycyUyRm1haGVuZHJhcmVkZHklMkZkZXZlbG9wZXIlMkZiaWxsaW5nX3N5c3RlbSUyRmJpbGxpbmctYXBwJTJGYXBwJnBhZ2VFeHRlbnNpb25zPXRzeCZwYWdlRXh0ZW5zaW9ucz10cyZwYWdlRXh0ZW5zaW9ucz1qc3gmcGFnZUV4dGVuc2lvbnM9anMmcm9vdERpcj0lMkZVc2VycyUyRm1haGVuZHJhcmVkZHklMkZkZXZlbG9wZXIlMkZiaWxsaW5nX3N5c3RlbSUyRmJpbGxpbmctYXBwJmlzRGV2PXRydWUmdHNjb25maWdQYXRoPXRzY29uZmlnLmpzb24mYmFzZVBhdGg9JmFzc2V0UHJlZml4PSZuZXh0Q29uZmlnT3V0cHV0PSZwcmVmZXJyZWRSZWdpb249Jm1pZGRsZXdhcmVDb25maWc9ZTMwJTNEISIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7OztBQUErRjtBQUN2QztBQUNxQjtBQUNnQztBQUM3RztBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiL1VzZXJzL21haGVuZHJhcmVkZHkvZGV2ZWxvcGVyL2JpbGxpbmdfc3lzdGVtL2JpbGxpbmctYXBwL2FwcC9hcGkvdXNlcnMvcm91dGUudHNcIjtcbi8vIFdlIGluamVjdCB0aGUgbmV4dENvbmZpZ091dHB1dCBoZXJlIHNvIHRoYXQgd2UgY2FuIHVzZSB0aGVtIGluIHRoZSByb3V0ZVxuLy8gbW9kdWxlLlxuY29uc3QgbmV4dENvbmZpZ091dHB1dCA9IFwiXCJcbmNvbnN0IHJvdXRlTW9kdWxlID0gbmV3IEFwcFJvdXRlUm91dGVNb2R1bGUoe1xuICAgIGRlZmluaXRpb246IHtcbiAgICAgICAga2luZDogUm91dGVLaW5kLkFQUF9ST1VURSxcbiAgICAgICAgcGFnZTogXCIvYXBpL3VzZXJzL3JvdXRlXCIsXG4gICAgICAgIHBhdGhuYW1lOiBcIi9hcGkvdXNlcnNcIixcbiAgICAgICAgZmlsZW5hbWU6IFwicm91dGVcIixcbiAgICAgICAgYnVuZGxlUGF0aDogXCJhcHAvYXBpL3VzZXJzL3JvdXRlXCJcbiAgICB9LFxuICAgIHJlc29sdmVkUGFnZVBhdGg6IFwiL1VzZXJzL21haGVuZHJhcmVkZHkvZGV2ZWxvcGVyL2JpbGxpbmdfc3lzdGVtL2JpbGxpbmctYXBwL2FwcC9hcGkvdXNlcnMvcm91dGUudHNcIixcbiAgICBuZXh0Q29uZmlnT3V0cHV0LFxuICAgIHVzZXJsYW5kXG59KTtcbi8vIFB1bGwgb3V0IHRoZSBleHBvcnRzIHRoYXQgd2UgbmVlZCB0byBleHBvc2UgZnJvbSB0aGUgbW9kdWxlLiBUaGlzIHNob3VsZFxuLy8gYmUgZWxpbWluYXRlZCB3aGVuIHdlJ3ZlIG1vdmVkIHRoZSBvdGhlciByb3V0ZXMgdG8gdGhlIG5ldyBmb3JtYXQuIFRoZXNlXG4vLyBhcmUgdXNlZCB0byBob29rIGludG8gdGhlIHJvdXRlLlxuY29uc3QgeyB3b3JrQXN5bmNTdG9yYWdlLCB3b3JrVW5pdEFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MgfSA9IHJvdXRlTW9kdWxlO1xuZnVuY3Rpb24gcGF0Y2hGZXRjaCgpIHtcbiAgICByZXR1cm4gX3BhdGNoRmV0Y2goe1xuICAgICAgICB3b3JrQXN5bmNTdG9yYWdlLFxuICAgICAgICB3b3JrVW5pdEFzeW5jU3RvcmFnZVxuICAgIH0pO1xufVxuZXhwb3J0IHsgcm91dGVNb2R1bGUsIHdvcmtBc3luY1N0b3JhZ2UsIHdvcmtVbml0QXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fusers%2Froute&page=%2Fapi%2Fusers%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fusers%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

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
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fusers%2Froute&page=%2Fapi%2Fusers%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fusers%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();