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
exports.id = "app/api/bills/route";
exports.ids = ["app/api/bills/route"];
exports.modules = {

/***/ "(rsc)/./app/api/bills/route.ts":
/*!********************************!*\
  !*** ./app/api/bills/route.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET),\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var fs_promises__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! fs/promises */ \"fs/promises\");\n/* harmony import */ var fs_promises__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(fs_promises__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _app_utils_logger__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @/app/utils/logger */ \"(rsc)/./app/utils/logger.ts\");\n/* harmony import */ var _lib_mysql__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../lib/mysql */ \"(rsc)/./lib/mysql.ts\");\n\n\n\n\n\nconst billsJsonPath = path__WEBPACK_IMPORTED_MODULE_2___default().resolve(process.cwd(), \"app/data/json/bills.json\");\nconst productsJsonPath = path__WEBPACK_IMPORTED_MODULE_2___default().resolve(process.cwd(), \"app/data/json/products.json\");\nasync function getBills() {\n    try {\n        const data = await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().readFile(billsJsonPath, \"utf-8\");\n        return JSON.parse(data);\n    } catch (error) {\n        if (error.code === 'ENOENT') {\n            return [];\n        }\n        throw error;\n    }\n}\nasync function saveBill(bill) {\n    const bills = await getBills();\n    bills.push(bill);\n    await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().writeFile(billsJsonPath, JSON.stringify(bills, null, 2));\n}\nasync function GET() {\n    const bills = await getBills();\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(bills);\n}\nasync function POST(request) {\n    const newBill = await request.json();\n    await saveBill(newBill);\n    (0,_app_utils_logger__WEBPACK_IMPORTED_MODULE_3__.logChange)(\"bills.json\", `New bill created: (ID: ${newBill.id})`);\n    // Update stock in products.json\n    try {\n        const productsData = await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().readFile(productsJsonPath, \"utf-8\");\n        const products = JSON.parse(productsData);\n        for (const item of newBill.items){\n            const productIndex = products.findIndex((p)=>p.id === item.productId);\n            if (productIndex !== -1) {\n                products[productIndex].stock -= item.quantity;\n                (0,_app_utils_logger__WEBPACK_IMPORTED_MODULE_3__.logChange)(\"products.json\", `Stock updated for product ${item.productId}: new stock ${products[productIndex].stock}`);\n            }\n        }\n        await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().writeFile(productsJsonPath, JSON.stringify(products, null, 2));\n    } catch (error) {\n        console.error('Error updating stock in products.json:', error);\n    }\n    // Update stock and other details in MySQL\n    const connection = await _lib_mysql__WEBPACK_IMPORTED_MODULE_4__[\"default\"].getConnection();\n    try {\n        await connection.beginTransaction();\n        // Check if user exists\n        if (newBill.createdBy && newBill.createdBy !== 'prime') {\n            const [rows] = await connection.execute('SELECT id FROM Users WHERE id = ?', [\n                newBill.createdBy\n            ]);\n            if (rows.length === 0) {\n                console.error(`User with id ${newBill.createdBy} not found. Skipping bill insertion.`);\n                await connection.rollback();\n                connection.release();\n                return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                    message: \"User not found\"\n                }, {\n                    status: 400\n                });\n            }\n        }\n        // Insert the bill first\n        await connection.execute(`INSERT INTO Bills (id, storeId, storeName, storeAddress, customerName, customerPhone, customerEmail, customerAddress, customerId, subtotal, taxPercentage, taxAmount, discountPercentage, discountAmount, total, paymentMethod, timestamp, notes, gstin, companyName, companyAddress, companyPhone, companyEmail, billFormat, createdBy)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [\n            newBill.id,\n            newBill.storeId ?? null,\n            newBill.storeName ?? null,\n            newBill.storeAddress ?? null,\n            newBill.customerName ?? null,\n            newBill.customerPhone ?? null,\n            newBill.customerEmail ?? null,\n            newBill.customerAddress ?? null,\n            newBill.customerId ?? null,\n            newBill.subtotal ?? 0,\n            newBill.taxPercentage ?? 0,\n            newBill.taxAmount ?? 0,\n            newBill.discountPercentage ?? 0,\n            newBill.discountAmount ?? 0,\n            newBill.total ?? 0,\n            newBill.paymentMethod ?? null,\n            newBill.timestamp,\n            newBill.notes ?? null,\n            newBill.gstin ?? null,\n            newBill.companyName ?? null,\n            newBill.companyAddress ?? null,\n            newBill.companyPhone ?? null,\n            newBill.companyEmail ?? null,\n            newBill.billFormat ?? null,\n            newBill.createdBy ?? null\n        ]);\n        // Then insert bill items\n        for (const item of newBill.items){\n            await connection.execute('INSERT INTO BillItems (billId, productId, name, quantity, price, total, tax, gstRate, barcodes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [\n                newBill.id,\n                item.productId,\n                item.name,\n                item.quantity,\n                item.price,\n                item.total,\n                item.tax,\n                item.gstRate,\n                item.barcodes\n            ]);\n            if (item.productId) {\n                await connection.execute('UPDATE Products SET stock = stock - ? WHERE id = ?', [\n                    item.quantity,\n                    item.productId\n                ]);\n            }\n        }\n        await connection.commit();\n    } catch (error) {\n        await connection.rollback();\n        console.error('Error inserting bill into MySQL:', error);\n    // Optionally, handle the error more gracefully\n    } finally{\n        connection.release();\n    }\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(newBill, {\n        status: 201\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,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dkgsSUFBSS9DLEtBQUtLLFNBQVMsRUFBRTtnQkFDbEIsTUFBTUksV0FBV0ssT0FBTyxDQUN0QixzREFDQTtvQkFBQ2QsS0FBS08sUUFBUTtvQkFBRVAsS0FBS0ssU0FBUztpQkFBQztZQUVuQztRQUNGO1FBQ0EsTUFBTUksV0FBV3VDLE1BQU07SUFDekIsRUFBRSxPQUFPaEUsT0FBTztRQUNkLE1BQU15QixXQUFXTyxRQUFRO1FBQ3pCUixRQUFReEIsS0FBSyxDQUFDLG9DQUFvQ0E7SUFDbEQsK0NBQStDO0lBQ2pELFNBQVU7UUFDUnlCLFdBQVdRLE9BQU87SUFDcEI7SUFFQSxPQUFPaEQscURBQVlBLENBQUN3QixJQUFJLENBQUNHLFNBQVM7UUFBRXVCLFFBQVE7SUFBSTtBQUNsRCIsInNvdXJjZXMiOlsiL1VzZXJzL21haGVuZHJhcmVkZHkvZGV2ZWxvcGVyL2JpbGxpbmdfc3lzdGVtL2JpbGxpbmctYXBwL2FwcC9hcGkvYmlsbHMvcm91dGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSBcIm5leHQvc2VydmVyXCI7XHJcbmltcG9ydCBmcyBmcm9tIFwiZnMvcHJvbWlzZXNcIjtcclxuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcclxuaW1wb3J0IHsgbG9nQ2hhbmdlIH0gZnJvbSBcIkAvYXBwL3V0aWxzL2xvZ2dlclwiO1xyXG5pbXBvcnQgcG9vbCBmcm9tIFwiLi4vLi4vLi4vbGliL215c3FsXCI7XHJcblxyXG5jb25zdCBiaWxsc0pzb25QYXRoID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIFwiYXBwL2RhdGEvanNvbi9iaWxscy5qc29uXCIpO1xyXG5jb25zdCBwcm9kdWN0c0pzb25QYXRoID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIFwiYXBwL2RhdGEvanNvbi9wcm9kdWN0cy5qc29uXCIpO1xyXG5cclxuYXN5bmMgZnVuY3Rpb24gZ2V0QmlsbHMoKSB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBmcy5yZWFkRmlsZShiaWxsc0pzb25QYXRoLCBcInV0Zi04XCIpO1xyXG4gICAgcmV0dXJuIEpTT04ucGFyc2UoZGF0YSk7XHJcbiAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgaWYgKGVycm9yLmNvZGUgPT09ICdFTk9FTlQnKSB7XHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gc2F2ZUJpbGwoYmlsbDogYW55KSB7XHJcbiAgY29uc3QgYmlsbHMgPSBhd2FpdCBnZXRCaWxscygpO1xyXG4gIGJpbGxzLnB1c2goYmlsbCk7XHJcbiAgYXdhaXQgZnMud3JpdGVGaWxlKGJpbGxzSnNvblBhdGgsIEpTT04uc3RyaW5naWZ5KGJpbGxzLCBudWxsLCAyKSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBHRVQoKSB7XHJcbiAgY29uc3QgYmlsbHMgPSBhd2FpdCBnZXRCaWxscygpO1xyXG4gIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihiaWxscyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBQT1NUKHJlcXVlc3Q6IFJlcXVlc3QpIHtcclxuICBjb25zdCBuZXdCaWxsID0gYXdhaXQgcmVxdWVzdC5qc29uKCk7XHJcbiAgYXdhaXQgc2F2ZUJpbGwobmV3QmlsbCk7XHJcbiAgbG9nQ2hhbmdlKFwiYmlsbHMuanNvblwiLCBgTmV3IGJpbGwgY3JlYXRlZDogKElEOiAke25ld0JpbGwuaWR9KWApO1xyXG5cclxuICAvLyBVcGRhdGUgc3RvY2sgaW4gcHJvZHVjdHMuanNvblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBwcm9kdWN0c0RhdGEgPSBhd2FpdCBmcy5yZWFkRmlsZShwcm9kdWN0c0pzb25QYXRoLCBcInV0Zi04XCIpO1xyXG4gICAgY29uc3QgcHJvZHVjdHMgPSBKU09OLnBhcnNlKHByb2R1Y3RzRGF0YSk7XHJcblxyXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIG5ld0JpbGwuaXRlbXMpIHtcclxuICAgICAgY29uc3QgcHJvZHVjdEluZGV4ID0gcHJvZHVjdHMuZmluZEluZGV4KChwOiBhbnkpID0+IHAuaWQgPT09IGl0ZW0ucHJvZHVjdElkKTtcclxuICAgICAgaWYgKHByb2R1Y3RJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICBwcm9kdWN0c1twcm9kdWN0SW5kZXhdLnN0b2NrIC09IGl0ZW0ucXVhbnRpdHk7XHJcbiAgICAgICAgbG9nQ2hhbmdlKFwicHJvZHVjdHMuanNvblwiLCBgU3RvY2sgdXBkYXRlZCBmb3IgcHJvZHVjdCAke2l0ZW0ucHJvZHVjdElkfTogbmV3IHN0b2NrICR7cHJvZHVjdHNbcHJvZHVjdEluZGV4XS5zdG9ja31gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IGZzLndyaXRlRmlsZShwcm9kdWN0c0pzb25QYXRoLCBKU09OLnN0cmluZ2lmeShwcm9kdWN0cywgbnVsbCwgMikpO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBzdG9jayBpbiBwcm9kdWN0cy5qc29uOicsIGVycm9yKTtcclxuICB9XHJcblxyXG4gIC8vIFVwZGF0ZSBzdG9jayBhbmQgb3RoZXIgZGV0YWlscyBpbiBNeVNRTFxyXG4gIGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCBwb29sLmdldENvbm5lY3Rpb24oKTtcclxuICB0cnkge1xyXG4gICAgYXdhaXQgY29ubmVjdGlvbi5iZWdpblRyYW5zYWN0aW9uKCk7XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgdXNlciBleGlzdHNcclxuICAgIGlmIChuZXdCaWxsLmNyZWF0ZWRCeSAmJiBuZXdCaWxsLmNyZWF0ZWRCeSAhPT0gJ3ByaW1lJykge1xyXG4gICAgICBjb25zdCBbcm93c10gPSBhd2FpdCBjb25uZWN0aW9uLmV4ZWN1dGUoJ1NFTEVDVCBpZCBGUk9NIFVzZXJzIFdIRVJFIGlkID0gPycsIFtuZXdCaWxsLmNyZWF0ZWRCeV0pO1xyXG4gICAgICBpZiAoKHJvd3MgYXMgYW55W10pLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYFVzZXIgd2l0aCBpZCAke25ld0JpbGwuY3JlYXRlZEJ5fSBub3QgZm91bmQuIFNraXBwaW5nIGJpbGwgaW5zZXJ0aW9uLmApO1xyXG4gICAgICAgIGF3YWl0IGNvbm5lY3Rpb24ucm9sbGJhY2soKTtcclxuICAgICAgICBjb25uZWN0aW9uLnJlbGVhc2UoKTtcclxuICAgICAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBtZXNzYWdlOiBcIlVzZXIgbm90IGZvdW5kXCIgfSwgeyBzdGF0dXM6IDQwMCB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEluc2VydCB0aGUgYmlsbCBmaXJzdFxyXG4gICAgYXdhaXQgY29ubmVjdGlvbi5leGVjdXRlKFxyXG4gICAgICBgSU5TRVJUIElOVE8gQmlsbHMgKGlkLCBzdG9yZUlkLCBzdG9yZU5hbWUsIHN0b3JlQWRkcmVzcywgY3VzdG9tZXJOYW1lLCBjdXN0b21lclBob25lLCBjdXN0b21lckVtYWlsLCBjdXN0b21lckFkZHJlc3MsIGN1c3RvbWVySWQsIHN1YnRvdGFsLCB0YXhQZXJjZW50YWdlLCB0YXhBbW91bnQsIGRpc2NvdW50UGVyY2VudGFnZSwgZGlzY291bnRBbW91bnQsIHRvdGFsLCBwYXltZW50TWV0aG9kLCB0aW1lc3RhbXAsIG5vdGVzLCBnc3RpbiwgY29tcGFueU5hbWUsIGNvbXBhbnlBZGRyZXNzLCBjb21wYW55UGhvbmUsIGNvbXBhbnlFbWFpbCwgYmlsbEZvcm1hdCwgY3JlYXRlZEJ5KVxyXG4gICAgICAgVkFMVUVTICg/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/KWAsXHJcbiAgICAgIFtcclxuICAgICAgICBuZXdCaWxsLmlkLFxyXG4gICAgICAgIG5ld0JpbGwuc3RvcmVJZCA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuc3RvcmVOYW1lID8/IG51bGwsXHJcbiAgICAgICAgbmV3QmlsbC5zdG9yZUFkZHJlc3MgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLmN1c3RvbWVyTmFtZSA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuY3VzdG9tZXJQaG9uZSA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuY3VzdG9tZXJFbWFpbCA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuY3VzdG9tZXJBZGRyZXNzID8/IG51bGwsXHJcbiAgICAgICAgbmV3QmlsbC5jdXN0b21lcklkID8/IG51bGwsXHJcbiAgICAgICAgbmV3QmlsbC5zdWJ0b3RhbCA/PyAwLFxyXG4gICAgICAgIG5ld0JpbGwudGF4UGVyY2VudGFnZSA/PyAwLFxyXG4gICAgICAgIG5ld0JpbGwudGF4QW1vdW50ID8/IDAsXHJcbiAgICAgICAgbmV3QmlsbC5kaXNjb3VudFBlcmNlbnRhZ2UgPz8gMCxcclxuICAgICAgICBuZXdCaWxsLmRpc2NvdW50QW1vdW50ID8/IDAsXHJcbiAgICAgICAgbmV3QmlsbC50b3RhbCA/PyAwLFxyXG4gICAgICAgIG5ld0JpbGwucGF5bWVudE1ldGhvZCA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwudGltZXN0YW1wLFxyXG4gICAgICAgIG5ld0JpbGwubm90ZXMgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLmdzdGluID8/IG51bGwsXHJcbiAgICAgICAgbmV3QmlsbC5jb21wYW55TmFtZSA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuY29tcGFueUFkZHJlc3MgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLmNvbXBhbnlQaG9uZSA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuY29tcGFueUVtYWlsID8/IG51bGwsXHJcbiAgICAgICAgbmV3QmlsbC5iaWxsRm9ybWF0ID8/IG51bGwsXHJcbiAgICAgICAgbmV3QmlsbC5jcmVhdGVkQnkgPz8gbnVsbCxcclxuICAgICAgXVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBUaGVuIGluc2VydCBiaWxsIGl0ZW1zXHJcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgbmV3QmlsbC5pdGVtcykge1xyXG4gICAgICBhd2FpdCBjb25uZWN0aW9uLmV4ZWN1dGUoXHJcbiAgICAgICAgJ0lOU0VSVCBJTlRPIEJpbGxJdGVtcyAoYmlsbElkLCBwcm9kdWN0SWQsIG5hbWUsIHF1YW50aXR5LCBwcmljZSwgdG90YWwsIHRheCwgZ3N0UmF0ZSwgYmFyY29kZXMpIFZBTFVFUyAoPywgPywgPywgPywgPywgPywgPywgPywgPyknLFxyXG4gICAgICAgIFtuZXdCaWxsLmlkLCBpdGVtLnByb2R1Y3RJZCwgaXRlbS5uYW1lLCBpdGVtLnF1YW50aXR5LCBpdGVtLnByaWNlLCBpdGVtLnRvdGFsLCBpdGVtLnRheCwgaXRlbS5nc3RSYXRlLCBpdGVtLmJhcmNvZGVzXVxyXG4gICAgICApO1xyXG5cclxuICAgICAgaWYgKGl0ZW0ucHJvZHVjdElkKSB7XHJcbiAgICAgICAgYXdhaXQgY29ubmVjdGlvbi5leGVjdXRlKFxyXG4gICAgICAgICAgJ1VQREFURSBQcm9kdWN0cyBTRVQgc3RvY2sgPSBzdG9jayAtID8gV0hFUkUgaWQgPSA/JyxcclxuICAgICAgICAgIFtpdGVtLnF1YW50aXR5LCBpdGVtLnByb2R1Y3RJZF1cclxuICAgICAgICApO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBhd2FpdCBjb25uZWN0aW9uLmNvbW1pdCgpO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBhd2FpdCBjb25uZWN0aW9uLnJvbGxiYWNrKCk7XHJcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbnNlcnRpbmcgYmlsbCBpbnRvIE15U1FMOicsIGVycm9yKTtcclxuICAgIC8vIE9wdGlvbmFsbHksIGhhbmRsZSB0aGUgZXJyb3IgbW9yZSBncmFjZWZ1bGx5XHJcbiAgfSBmaW5hbGx5IHtcclxuICAgIGNvbm5lY3Rpb24ucmVsZWFzZSgpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKG5ld0JpbGwsIHsgc3RhdHVzOiAyMDEgfSk7XHJcbn1cclxuIl0sIm5hbWVzIjpbIk5leHRSZXNwb25zZSIsImZzIiwicGF0aCIsImxvZ0NoYW5nZSIsInBvb2wiLCJiaWxsc0pzb25QYXRoIiwicmVzb2x2ZSIsInByb2Nlc3MiLCJjd2QiLCJwcm9kdWN0c0pzb25QYXRoIiwiZ2V0QmlsbHMiLCJkYXRhIiwicmVhZEZpbGUiLCJKU09OIiwicGFyc2UiLCJlcnJvciIsImNvZGUiLCJzYXZlQmlsbCIsImJpbGwiLCJiaWxscyIsInB1c2giLCJ3cml0ZUZpbGUiLCJzdHJpbmdpZnkiLCJHRVQiLCJqc29uIiwiUE9TVCIsInJlcXVlc3QiLCJuZXdCaWxsIiwiaWQiLCJwcm9kdWN0c0RhdGEiLCJwcm9kdWN0cyIsIml0ZW0iLCJpdGVtcyIsInByb2R1Y3RJbmRleCIsImZpbmRJbmRleCIsInAiLCJwcm9kdWN0SWQiLCJzdG9jayIsInF1YW50aXR5IiwiY29uc29sZSIsImNvbm5lY3Rpb24iLCJnZXRDb25uZWN0aW9uIiwiYmVnaW5UcmFuc2FjdGlvbiIsImNyZWF0ZWRCeSIsInJvd3MiLCJleGVjdXRlIiwibGVuZ3RoIiwicm9sbGJhY2siLCJyZWxlYXNlIiwibWVzc2FnZSIsInN0YXR1cyIsInN0b3JlSWQiLCJzdG9yZU5hbWUiLCJzdG9yZUFkZHJlc3MiLCJjdXN0b21lck5hbWUiLCJjdXN0b21lclBob25lIiwiY3VzdG9tZXJFbWFpbCIsImN1c3RvbWVyQWRkcmVzcyIsImN1c3RvbWVySWQiLCJzdWJ0b3RhbCIsInRheFBlcmNlbnRhZ2UiLCJ0YXhBbW91bnQiLCJkaXNjb3VudFBlcmNlbnRhZ2UiLCJkaXNjb3VudEFtb3VudCIsInRvdGFsIiwicGF5bWVudE1ldGhvZCIsInRpbWVzdGFtcCIsIm5vdGVzIiwiZ3N0aW4iLCJjb21wYW55TmFtZSIsImNvbXBhbnlBZGRyZXNzIiwiY29tcGFueVBob25lIiwiY29tcGFueUVtYWlsIiwiYmlsbEZvcm1hdCIsIm5hbWUiLCJwcmljZSIsInRheCIsImdzdFJhdGUiLCJiYXJjb2RlcyIsImNvbW1pdCJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./app/api/bills/route.ts\n");

/***/ }),

/***/ "(rsc)/./app/utils/logger.ts":
/*!*****************************!*\
  !*** ./app/utils/logger.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   createLog: () => (/* binding */ createLog),\n/* harmony export */   logChange: () => (/* binding */ logChange)\n/* harmony export */ });\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! fs */ \"fs\");\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_1__);\n\n\nconst logsDir = path__WEBPACK_IMPORTED_MODULE_1___default().join(process.cwd(), 'app', 'data', 'logs');\nif (!fs__WEBPACK_IMPORTED_MODULE_0___default().existsSync(logsDir)) {\n    fs__WEBPACK_IMPORTED_MODULE_0___default().mkdirSync(logsDir, {\n        recursive: true\n    });\n}\nconst logChange = (fileName, change)=>{\n    const logFilePath = path__WEBPACK_IMPORTED_MODULE_1___default().join(logsDir, `${fileName}.log`);\n    const timestamp = new Date().toISOString();\n    const logMessage = `${timestamp} - ${change}\\n`;\n    fs__WEBPACK_IMPORTED_MODULE_0___default().appendFileSync(logFilePath, logMessage);\n};\nconst createLog = async (logFilePath, content)=>{\n    await fs__WEBPACK_IMPORTED_MODULE_0___default().promises.writeFile(logFilePath, content, \"utf-8\");\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvdXRpbHMvbG9nZ2VyLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFvQjtBQUNJO0FBRXhCLE1BQU1FLFVBQVVELGdEQUFTLENBQUNHLFFBQVFDLEdBQUcsSUFBSSxPQUFPLFFBQVE7QUFFeEQsSUFBSSxDQUFDTCxvREFBYSxDQUFDRSxVQUFVO0lBQzNCRixtREFBWSxDQUFDRSxTQUFTO1FBQUVNLFdBQVc7SUFBSztBQUMxQztBQUVPLE1BQU1DLFlBQVksQ0FBQ0MsVUFBa0JDO0lBQzFDLE1BQU1DLGNBQWNYLGdEQUFTLENBQUNDLFNBQVMsR0FBR1EsU0FBUyxJQUFJLENBQUM7SUFDeEQsTUFBTUcsWUFBWSxJQUFJQyxPQUFPQyxXQUFXO0lBQ3hDLE1BQU1DLGFBQWEsR0FBR0gsVUFBVSxHQUFHLEVBQUVGLE9BQU8sRUFBRSxDQUFDO0lBRS9DWCx3REFBaUIsQ0FBQ1ksYUFBYUk7QUFDakMsRUFBRTtBQUVLLE1BQU1FLFlBQVksT0FBT04sYUFBcUJPO0lBQ25ELE1BQU1uQixrREFBVyxDQUFDcUIsU0FBUyxDQUFDVCxhQUFhTyxTQUFTO0FBQ3BELEVBQUUiLCJzb3VyY2VzIjpbIi9Vc2Vycy9tYWhlbmRyYXJlZGR5L2RldmVsb3Blci9iaWxsaW5nX3N5c3RlbS9iaWxsaW5nLWFwcC9hcHAvdXRpbHMvbG9nZ2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuY29uc3QgbG9nc0RpciA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnYXBwJywgJ2RhdGEnLCAnbG9ncycpO1xyXG5cclxuaWYgKCFmcy5leGlzdHNTeW5jKGxvZ3NEaXIpKSB7XHJcbiAgZnMubWtkaXJTeW5jKGxvZ3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgbG9nQ2hhbmdlID0gKGZpbGVOYW1lOiBzdHJpbmcsIGNoYW5nZTogc3RyaW5nKSA9PiB7XHJcbiAgY29uc3QgbG9nRmlsZVBhdGggPSBwYXRoLmpvaW4obG9nc0RpciwgYCR7ZmlsZU5hbWV9LmxvZ2ApO1xyXG4gIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICBjb25zdCBsb2dNZXNzYWdlID0gYCR7dGltZXN0YW1wfSAtICR7Y2hhbmdlfVxcbmA7XHJcblxyXG4gIGZzLmFwcGVuZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCBsb2dNZXNzYWdlKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBjcmVhdGVMb2cgPSBhc3luYyAobG9nRmlsZVBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKSA9PiB7XHJcbiAgYXdhaXQgZnMucHJvbWlzZXMud3JpdGVGaWxlKGxvZ0ZpbGVQYXRoLCBjb250ZW50LCBcInV0Zi04XCIpO1xyXG59O1xyXG4iXSwibmFtZXMiOlsiZnMiLCJwYXRoIiwibG9nc0RpciIsImpvaW4iLCJwcm9jZXNzIiwiY3dkIiwiZXhpc3RzU3luYyIsIm1rZGlyU3luYyIsInJlY3Vyc2l2ZSIsImxvZ0NoYW5nZSIsImZpbGVOYW1lIiwiY2hhbmdlIiwibG9nRmlsZVBhdGgiLCJ0aW1lc3RhbXAiLCJEYXRlIiwidG9JU09TdHJpbmciLCJsb2dNZXNzYWdlIiwiYXBwZW5kRmlsZVN5bmMiLCJjcmVhdGVMb2ciLCJjb250ZW50IiwicHJvbWlzZXMiLCJ3cml0ZUZpbGUiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/utils/logger.ts\n");

/***/ }),

/***/ "(rsc)/./lib/mysql.ts":
/*!**********************!*\
  !*** ./lib/mysql.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   connectToDatabase: () => (/* binding */ connectToDatabase),\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony import */ var mysql2_promise__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! mysql2/promise */ \"(rsc)/./node_modules/mysql2/promise.js\");\n\n// Create the connection pool. The pool-specific settings are the defaults\nconst pool = mysql2_promise__WEBPACK_IMPORTED_MODULE_0__.createPool({\n    host: '86.38.243.155',\n    user: 'u408450631_siri',\n    password: 'Siriart@2025',\n    database: 'u408450631_siri',\n    waitForConnections: true,\n    connectionLimit: 10,\n    queueLimit: 0\n});\nasync function connectToDatabase() {\n    return await pool.getConnection();\n}\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (pool);\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9saWIvbXlzcWwudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQW1DO0FBRW5DLDBFQUEwRTtBQUMxRSxNQUFNQyxPQUFPRCxzREFBZ0IsQ0FBQztJQUM1QkcsTUFBTTtJQUNOQyxNQUFNO0lBQ05DLFVBQVU7SUFDVkMsVUFBVTtJQUNWQyxvQkFBb0I7SUFDcEJDLGlCQUFpQjtJQUNqQkMsWUFBWTtBQUNkO0FBRU8sZUFBZUM7SUFDcEIsT0FBTyxNQUFNVCxLQUFLVSxhQUFhO0FBQ2pDO0FBRUEsaUVBQWVWLElBQUlBLEVBQUMiLCJzb3VyY2VzIjpbIi9Vc2Vycy9tYWhlbmRyYXJlZGR5L2RldmVsb3Blci9iaWxsaW5nX3N5c3RlbS9iaWxsaW5nLWFwcC9saWIvbXlzcWwudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IG15c3FsIGZyb20gJ215c3FsMi9wcm9taXNlJztcclxuXHJcbi8vIENyZWF0ZSB0aGUgY29ubmVjdGlvbiBwb29sLiBUaGUgcG9vbC1zcGVjaWZpYyBzZXR0aW5ncyBhcmUgdGhlIGRlZmF1bHRzXHJcbmNvbnN0IHBvb2wgPSBteXNxbC5jcmVhdGVQb29sKHtcclxuICBob3N0OiAnODYuMzguMjQzLjE1NScsXHJcbiAgdXNlcjogJ3U0MDg0NTA2MzFfc2lyaScsXHJcbiAgcGFzc3dvcmQ6ICdTaXJpYXJ0QDIwMjUnLFxyXG4gIGRhdGFiYXNlOiAndTQwODQ1MDYzMV9zaXJpJyxcclxuICB3YWl0Rm9yQ29ubmVjdGlvbnM6IHRydWUsXHJcbiAgY29ubmVjdGlvbkxpbWl0OiAxMCxcclxuICBxdWV1ZUxpbWl0OiAwXHJcbn0pO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbm5lY3RUb0RhdGFiYXNlKCkge1xyXG4gIHJldHVybiBhd2FpdCBwb29sLmdldENvbm5lY3Rpb24oKTtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgcG9vbDtcclxuIl0sIm5hbWVzIjpbIm15c3FsIiwicG9vbCIsImNyZWF0ZVBvb2wiLCJob3N0IiwidXNlciIsInBhc3N3b3JkIiwiZGF0YWJhc2UiLCJ3YWl0Rm9yQ29ubmVjdGlvbnMiLCJjb25uZWN0aW9uTGltaXQiLCJxdWV1ZUxpbWl0IiwiY29ubmVjdFRvRGF0YWJhc2UiLCJnZXRDb25uZWN0aW9uIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./lib/mysql.ts\n");

/***/ }),

/***/ "(rsc)/./node_modules/mysql2/lib sync recursive ^cardinal.*$":
/*!****************************************************!*\
  !*** ./node_modules/mysql2/lib/ sync ^cardinal.*$ ***!
  \****************************************************/
/***/ ((module) => {

function webpackEmptyContext(req) {
	var e = new Error("Cannot find module '" + req + "'");
	e.code = 'MODULE_NOT_FOUND';
	throw e;
}
webpackEmptyContext.keys = () => ([]);
webpackEmptyContext.resolve = webpackEmptyContext;
webpackEmptyContext.id = "(rsc)/./node_modules/mysql2/lib sync recursive ^cardinal.*$";
module.exports = webpackEmptyContext;

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fbills%2Froute&page=%2Fapi%2Fbills%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fbills%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!***************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fbills%2Froute&page=%2Fapi%2Fbills%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fbills%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \***************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _Users_mahendrareddy_developer_billing_system_billing_app_app_api_bills_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/bills/route.ts */ \"(rsc)/./app/api/bills/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/bills/route\",\n        pathname: \"/api/bills\",\n        filename: \"route\",\n        bundlePath: \"app/api/bills/route\"\n    },\n    resolvedPagePath: \"/Users/mahendrareddy/developer/billing_system/billing-app/app/api/bills/route.ts\",\n    nextConfigOutput,\n    userland: _Users_mahendrareddy_developer_billing_system_billing_app_app_api_bills_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZiaWxscyUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGYmlsbHMlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZiaWxscyUyRnJvdXRlLnRzJmFwcERpcj0lMkZVc2VycyUyRm1haGVuZHJhcmVkZHklMkZkZXZlbG9wZXIlMkZiaWxsaW5nX3N5c3RlbSUyRmJpbGxpbmctYXBwJTJGYXBwJnBhZ2VFeHRlbnNpb25zPXRzeCZwYWdlRXh0ZW5zaW9ucz10cyZwYWdlRXh0ZW5zaW9ucz1qc3gmcGFnZUV4dGVuc2lvbnM9anMmcm9vdERpcj0lMkZVc2VycyUyRm1haGVuZHJhcmVkZHklMkZkZXZlbG9wZXIlMkZiaWxsaW5nX3N5c3RlbSUyRmJpbGxpbmctYXBwJmlzRGV2PXRydWUmdHNjb25maWdQYXRoPXRzY29uZmlnLmpzb24mYmFzZVBhdGg9JmFzc2V0UHJlZml4PSZuZXh0Q29uZmlnT3V0cHV0PSZwcmVmZXJyZWRSZWdpb249Jm1pZGRsZXdhcmVDb25maWc9ZTMwJTNEISIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7OztBQUErRjtBQUN2QztBQUNxQjtBQUNnQztBQUM3RztBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiL1VzZXJzL21haGVuZHJhcmVkZHkvZGV2ZWxvcGVyL2JpbGxpbmdfc3lzdGVtL2JpbGxpbmctYXBwL2FwcC9hcGkvYmlsbHMvcm91dGUudHNcIjtcbi8vIFdlIGluamVjdCB0aGUgbmV4dENvbmZpZ091dHB1dCBoZXJlIHNvIHRoYXQgd2UgY2FuIHVzZSB0aGVtIGluIHRoZSByb3V0ZVxuLy8gbW9kdWxlLlxuY29uc3QgbmV4dENvbmZpZ091dHB1dCA9IFwiXCJcbmNvbnN0IHJvdXRlTW9kdWxlID0gbmV3IEFwcFJvdXRlUm91dGVNb2R1bGUoe1xuICAgIGRlZmluaXRpb246IHtcbiAgICAgICAga2luZDogUm91dGVLaW5kLkFQUF9ST1VURSxcbiAgICAgICAgcGFnZTogXCIvYXBpL2JpbGxzL3JvdXRlXCIsXG4gICAgICAgIHBhdGhuYW1lOiBcIi9hcGkvYmlsbHNcIixcbiAgICAgICAgZmlsZW5hbWU6IFwicm91dGVcIixcbiAgICAgICAgYnVuZGxlUGF0aDogXCJhcHAvYXBpL2JpbGxzL3JvdXRlXCJcbiAgICB9LFxuICAgIHJlc29sdmVkUGFnZVBhdGg6IFwiL1VzZXJzL21haGVuZHJhcmVkZHkvZGV2ZWxvcGVyL2JpbGxpbmdfc3lzdGVtL2JpbGxpbmctYXBwL2FwcC9hcGkvYmlsbHMvcm91dGUudHNcIixcbiAgICBuZXh0Q29uZmlnT3V0cHV0LFxuICAgIHVzZXJsYW5kXG59KTtcbi8vIFB1bGwgb3V0IHRoZSBleHBvcnRzIHRoYXQgd2UgbmVlZCB0byBleHBvc2UgZnJvbSB0aGUgbW9kdWxlLiBUaGlzIHNob3VsZFxuLy8gYmUgZWxpbWluYXRlZCB3aGVuIHdlJ3ZlIG1vdmVkIHRoZSBvdGhlciByb3V0ZXMgdG8gdGhlIG5ldyBmb3JtYXQuIFRoZXNlXG4vLyBhcmUgdXNlZCB0byBob29rIGludG8gdGhlIHJvdXRlLlxuY29uc3QgeyB3b3JrQXN5bmNTdG9yYWdlLCB3b3JrVW5pdEFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MgfSA9IHJvdXRlTW9kdWxlO1xuZnVuY3Rpb24gcGF0Y2hGZXRjaCgpIHtcbiAgICByZXR1cm4gX3BhdGNoRmV0Y2goe1xuICAgICAgICB3b3JrQXN5bmNTdG9yYWdlLFxuICAgICAgICB3b3JrVW5pdEFzeW5jU3RvcmFnZVxuICAgIH0pO1xufVxuZXhwb3J0IHsgcm91dGVNb2R1bGUsIHdvcmtBc3luY1N0b3JhZ2UsIHdvcmtVbml0QXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fbills%2Froute&page=%2Fapi%2Fbills%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fbills%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

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

/***/ "buffer":
/*!*************************!*\
  !*** external "buffer" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("buffer");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("crypto");

/***/ }),

/***/ "events":
/*!*************************!*\
  !*** external "events" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("events");

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

/***/ "net":
/*!**********************!*\
  !*** external "net" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("net");

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

/***/ }),

/***/ "process":
/*!**************************!*\
  !*** external "process" ***!
  \**************************/
/***/ ((module) => {

"use strict";
module.exports = require("process");

/***/ }),

/***/ "stream":
/*!*************************!*\
  !*** external "stream" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ }),

/***/ "string_decoder":
/*!*********************************!*\
  !*** external "string_decoder" ***!
  \*********************************/
/***/ ((module) => {

"use strict";
module.exports = require("string_decoder");

/***/ }),

/***/ "timers":
/*!*************************!*\
  !*** external "timers" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("timers");

/***/ }),

/***/ "tls":
/*!**********************!*\
  !*** external "tls" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("tls");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("url");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("util");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("zlib");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/mysql2","vendor-chunks/iconv-lite","vendor-chunks/aws-ssl-profiles","vendor-chunks/sqlstring","vendor-chunks/seq-queue","vendor-chunks/named-placeholders","vendor-chunks/long","vendor-chunks/safer-buffer","vendor-chunks/lru.min","vendor-chunks/is-property","vendor-chunks/generate-function","vendor-chunks/denque"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fbills%2Froute&page=%2Fapi%2Fbills%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fbills%2Froute.ts&appDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fmahendrareddy%2Fdeveloper%2Fbilling_system%2Fbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();