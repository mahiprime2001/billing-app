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
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET),\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var fs_promises__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! fs/promises */ \"fs/promises\");\n/* harmony import */ var fs_promises__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(fs_promises__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _app_utils_logger__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @/app/utils/logger */ \"(rsc)/./app/utils/logger.ts\");\n/* harmony import */ var _lib_mysql__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../lib/mysql */ \"(rsc)/./lib/mysql.ts\");\n\n\n\n\n\nconst billsJsonPath = path__WEBPACK_IMPORTED_MODULE_2___default().resolve(process.cwd(), \"app/data/json/bills.json\");\nconst productsJsonPath = path__WEBPACK_IMPORTED_MODULE_2___default().resolve(process.cwd(), \"app/data/json/products.json\");\nasync function getBills() {\n    try {\n        const data = await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().readFile(billsJsonPath, \"utf-8\");\n        return JSON.parse(data);\n    } catch (error) {\n        if (error.code === 'ENOENT') {\n            return [];\n        }\n        throw error;\n    }\n}\nasync function saveBill(bill) {\n    const bills = await getBills();\n    bills.push(bill);\n    await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().writeFile(billsJsonPath, JSON.stringify(bills, null, 2));\n}\nasync function GET() {\n    const bills = await getBills();\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(bills);\n}\nasync function POST(request) {\n    const newBill = await request.json();\n    await saveBill(newBill);\n    (0,_app_utils_logger__WEBPACK_IMPORTED_MODULE_3__.logChange)(\"bills.json\", `New bill created: (ID: ${newBill.id})`);\n    // Update stock in products.json\n    try {\n        const productsData = await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().readFile(productsJsonPath, \"utf-8\");\n        const products = JSON.parse(productsData);\n        for (const item of newBill.items){\n            const productIndex = products.findIndex((p)=>p.id === item.productId);\n            if (productIndex !== -1) {\n                products[productIndex].stock -= item.quantity;\n                (0,_app_utils_logger__WEBPACK_IMPORTED_MODULE_3__.logChange)(\"products.json\", `Stock updated for product ${item.productId}: new stock ${products[productIndex].stock}`);\n            }\n        }\n        await fs_promises__WEBPACK_IMPORTED_MODULE_1___default().writeFile(productsJsonPath, JSON.stringify(products, null, 2));\n    } catch (error) {\n        console.error('Error updating stock in products.json:', error);\n    }\n    // Update stock and other details in MySQL\n    const connection = await _lib_mysql__WEBPACK_IMPORTED_MODULE_4__[\"default\"].getConnection();\n    try {\n        await connection.beginTransaction();\n        // Check if user exists\n        if (newBill.createdBy && newBill.createdBy !== 'prime') {\n            const [rows] = await connection.execute('SELECT id FROM Users WHERE id = ?', [\n                newBill.createdBy\n            ]);\n            if (rows.length === 0) {\n                console.error(`User with id ${newBill.createdBy} not found. Skipping bill insertion.`);\n                await connection.rollback();\n                connection.release();\n                return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                    message: \"User not found\"\n                }, {\n                    status: 400\n                });\n            }\n        }\n        // Insert the bill first\n        await connection.execute(`INSERT INTO Bills (id, storeId, storeName, storeAddress, customerName, customerPhone, customerEmail, customerAddress, customerId, subtotal, taxPercentage, taxAmount, discountPercentage, discountAmount, total, paymentMethod, timestamp, notes, gstin, companyName, companyAddress, companyPhone, companyEmail, billFormat, createdBy)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [\n            newBill.id,\n            newBill.storeId ?? null,\n            newBill.storeName ?? null,\n            newBill.storeAddress ?? null,\n            newBill.customerName ?? null,\n            newBill.customerPhone ?? null,\n            newBill.customerEmail ?? null,\n            newBill.customerAddress ?? null,\n            newBill.customerId ?? null,\n            newBill.subtotal ?? 0,\n            newBill.taxPercentage ?? 0,\n            newBill.taxAmount ?? 0,\n            newBill.discountPercentage ?? 0,\n            newBill.discountAmount ?? 0,\n            newBill.total ?? 0,\n            newBill.paymentMethod ?? null,\n            newBill.timestamp,\n            newBill.notes ?? null,\n            newBill.gstin ?? null,\n            newBill.companyName ?? null,\n            newBill.companyAddress ?? null,\n            newBill.companyPhone ?? null,\n            newBill.companyEmail ?? null,\n            newBill.billFormat ?? null,\n            newBill.createdBy ?? null\n        ]);\n        // Then insert bill items\n        for (const item of newBill.items){\n            await connection.execute('INSERT INTO BillItems (billId, productId, name, quantity, price, total, tax, gstRate, barcodes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [\n                newBill.id,\n                item.productId,\n                item.name,\n                item.quantity,\n                item.price,\n                item.total,\n                item.tax,\n                item.gstRate,\n                item.barcodes\n            ]);\n            if (item.productId) {\n                await connection.execute('UPDATE Products SET stock = stock - ? WHERE id = ?', [\n                    item.quantity,\n                    item.productId\n                ]);\n            }\n        }\n        await connection.commit();\n    } catch (error) {\n        await connection.rollback();\n        console.error('Error inserting bill into MySQL:', error);\n    // Optionally, handle the error more gracefully\n    } finally{\n        connection.release();\n    }\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json(newBill, {\n        status: 201\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,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dkgsSUFBSS9DLEtBQUtLLFNBQVMsRUFBRTtnQkFDbEIsTUFBTUksV0FBV0ssT0FBTyxDQUN0QixzREFDQTtvQkFBQ2QsS0FBS08sUUFBUTtvQkFBRVAsS0FBS0ssU0FBUztpQkFBQztZQUVuQztRQUNGO1FBQ0EsTUFBTUksV0FBV3VDLE1BQU07SUFDekIsRUFBRSxPQUFPaEUsT0FBTztRQUNkLE1BQU15QixXQUFXTyxRQUFRO1FBQ3pCUixRQUFReEIsS0FBSyxDQUFDLG9DQUFvQ0E7SUFDbEQsK0NBQStDO0lBQ2pELFNBQVU7UUFDUnlCLFdBQVdRLE9BQU87SUFDcEI7SUFFQSxPQUFPaEQscURBQVlBLENBQUN3QixJQUFJLENBQUNHLFNBQVM7UUFBRXVCLFFBQVE7SUFBSTtBQUNsRCIsInNvdXJjZXMiOlsiRTpcXGJpbGxpbmctYXBwXFxhcHBcXGFwaVxcYmlsbHNcXHJvdXRlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE5leHRSZXNwb25zZSB9IGZyb20gXCJuZXh0L3NlcnZlclwiO1xyXG5pbXBvcnQgZnMgZnJvbSBcImZzL3Byb21pc2VzXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCB7IGxvZ0NoYW5nZSB9IGZyb20gXCJAL2FwcC91dGlscy9sb2dnZXJcIjtcclxuaW1wb3J0IHBvb2wgZnJvbSBcIi4uLy4uLy4uL2xpYi9teXNxbFwiO1xyXG5cclxuY29uc3QgYmlsbHNKc29uUGF0aCA9IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBcImFwcC9kYXRhL2pzb24vYmlsbHMuanNvblwiKTtcclxuY29uc3QgcHJvZHVjdHNKc29uUGF0aCA9IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBcImFwcC9kYXRhL2pzb24vcHJvZHVjdHMuanNvblwiKTtcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdldEJpbGxzKCkge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgZnMucmVhZEZpbGUoYmlsbHNKc29uUGF0aCwgXCJ1dGYtOFwiKTtcclxuICAgIHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xyXG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgIGlmIChlcnJvci5jb2RlID09PSAnRU5PRU5UJykge1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHNhdmVCaWxsKGJpbGw6IGFueSkge1xyXG4gIGNvbnN0IGJpbGxzID0gYXdhaXQgZ2V0QmlsbHMoKTtcclxuICBiaWxscy5wdXNoKGJpbGwpO1xyXG4gIGF3YWl0IGZzLndyaXRlRmlsZShiaWxsc0pzb25QYXRoLCBKU09OLnN0cmluZ2lmeShiaWxscywgbnVsbCwgMikpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gR0VUKCkge1xyXG4gIGNvbnN0IGJpbGxzID0gYXdhaXQgZ2V0QmlsbHMoKTtcclxuICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oYmlsbHMpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gUE9TVChyZXF1ZXN0OiBSZXF1ZXN0KSB7XHJcbiAgY29uc3QgbmV3QmlsbCA9IGF3YWl0IHJlcXVlc3QuanNvbigpO1xyXG4gIGF3YWl0IHNhdmVCaWxsKG5ld0JpbGwpO1xyXG4gIGxvZ0NoYW5nZShcImJpbGxzLmpzb25cIiwgYE5ldyBiaWxsIGNyZWF0ZWQ6IChJRDogJHtuZXdCaWxsLmlkfSlgKTtcclxuXHJcbiAgLy8gVXBkYXRlIHN0b2NrIGluIHByb2R1Y3RzLmpzb25cclxuICB0cnkge1xyXG4gICAgY29uc3QgcHJvZHVjdHNEYXRhID0gYXdhaXQgZnMucmVhZEZpbGUocHJvZHVjdHNKc29uUGF0aCwgXCJ1dGYtOFwiKTtcclxuICAgIGNvbnN0IHByb2R1Y3RzID0gSlNPTi5wYXJzZShwcm9kdWN0c0RhdGEpO1xyXG5cclxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBuZXdCaWxsLml0ZW1zKSB7XHJcbiAgICAgIGNvbnN0IHByb2R1Y3RJbmRleCA9IHByb2R1Y3RzLmZpbmRJbmRleCgocDogYW55KSA9PiBwLmlkID09PSBpdGVtLnByb2R1Y3RJZCk7XHJcbiAgICAgIGlmIChwcm9kdWN0SW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgcHJvZHVjdHNbcHJvZHVjdEluZGV4XS5zdG9jayAtPSBpdGVtLnF1YW50aXR5O1xyXG4gICAgICAgIGxvZ0NoYW5nZShcInByb2R1Y3RzLmpzb25cIiwgYFN0b2NrIHVwZGF0ZWQgZm9yIHByb2R1Y3QgJHtpdGVtLnByb2R1Y3RJZH06IG5ldyBzdG9jayAke3Byb2R1Y3RzW3Byb2R1Y3RJbmRleF0uc3RvY2t9YCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBmcy53cml0ZUZpbGUocHJvZHVjdHNKc29uUGF0aCwgSlNPTi5zdHJpbmdpZnkocHJvZHVjdHMsIG51bGwsIDIpKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgc3RvY2sgaW4gcHJvZHVjdHMuanNvbjonLCBlcnJvcik7XHJcbiAgfVxyXG5cclxuICAvLyBVcGRhdGUgc3RvY2sgYW5kIG90aGVyIGRldGFpbHMgaW4gTXlTUUxcclxuICBjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgcG9vbC5nZXRDb25uZWN0aW9uKCk7XHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IGNvbm5lY3Rpb24uYmVnaW5UcmFuc2FjdGlvbigpO1xyXG5cclxuICAgIC8vIENoZWNrIGlmIHVzZXIgZXhpc3RzXHJcbiAgICBpZiAobmV3QmlsbC5jcmVhdGVkQnkgJiYgbmV3QmlsbC5jcmVhdGVkQnkgIT09ICdwcmltZScpIHtcclxuICAgICAgY29uc3QgW3Jvd3NdID0gYXdhaXQgY29ubmVjdGlvbi5leGVjdXRlKCdTRUxFQ1QgaWQgRlJPTSBVc2VycyBXSEVSRSBpZCA9ID8nLCBbbmV3QmlsbC5jcmVhdGVkQnldKTtcclxuICAgICAgaWYgKChyb3dzIGFzIGFueVtdKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKGBVc2VyIHdpdGggaWQgJHtuZXdCaWxsLmNyZWF0ZWRCeX0gbm90IGZvdW5kLiBTa2lwcGluZyBiaWxsIGluc2VydGlvbi5gKTtcclxuICAgICAgICBhd2FpdCBjb25uZWN0aW9uLnJvbGxiYWNrKCk7XHJcbiAgICAgICAgY29ubmVjdGlvbi5yZWxlYXNlKCk7XHJcbiAgICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgbWVzc2FnZTogXCJVc2VyIG5vdCBmb3VuZFwiIH0sIHsgc3RhdHVzOiA0MDAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJbnNlcnQgdGhlIGJpbGwgZmlyc3RcclxuICAgIGF3YWl0IGNvbm5lY3Rpb24uZXhlY3V0ZShcclxuICAgICAgYElOU0VSVCBJTlRPIEJpbGxzIChpZCwgc3RvcmVJZCwgc3RvcmVOYW1lLCBzdG9yZUFkZHJlc3MsIGN1c3RvbWVyTmFtZSwgY3VzdG9tZXJQaG9uZSwgY3VzdG9tZXJFbWFpbCwgY3VzdG9tZXJBZGRyZXNzLCBjdXN0b21lcklkLCBzdWJ0b3RhbCwgdGF4UGVyY2VudGFnZSwgdGF4QW1vdW50LCBkaXNjb3VudFBlcmNlbnRhZ2UsIGRpc2NvdW50QW1vdW50LCB0b3RhbCwgcGF5bWVudE1ldGhvZCwgdGltZXN0YW1wLCBub3RlcywgZ3N0aW4sIGNvbXBhbnlOYW1lLCBjb21wYW55QWRkcmVzcywgY29tcGFueVBob25lLCBjb21wYW55RW1haWwsIGJpbGxGb3JtYXQsIGNyZWF0ZWRCeSlcclxuICAgICAgIFZBTFVFUyAoPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPylgLFxyXG4gICAgICBbXHJcbiAgICAgICAgbmV3QmlsbC5pZCxcclxuICAgICAgICBuZXdCaWxsLnN0b3JlSWQgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLnN0b3JlTmFtZSA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuc3RvcmVBZGRyZXNzID8/IG51bGwsXHJcbiAgICAgICAgbmV3QmlsbC5jdXN0b21lck5hbWUgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLmN1c3RvbWVyUGhvbmUgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLmN1c3RvbWVyRW1haWwgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLmN1c3RvbWVyQWRkcmVzcyA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuY3VzdG9tZXJJZCA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuc3VidG90YWwgPz8gMCxcclxuICAgICAgICBuZXdCaWxsLnRheFBlcmNlbnRhZ2UgPz8gMCxcclxuICAgICAgICBuZXdCaWxsLnRheEFtb3VudCA/PyAwLFxyXG4gICAgICAgIG5ld0JpbGwuZGlzY291bnRQZXJjZW50YWdlID8/IDAsXHJcbiAgICAgICAgbmV3QmlsbC5kaXNjb3VudEFtb3VudCA/PyAwLFxyXG4gICAgICAgIG5ld0JpbGwudG90YWwgPz8gMCxcclxuICAgICAgICBuZXdCaWxsLnBheW1lbnRNZXRob2QgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLnRpbWVzdGFtcCxcclxuICAgICAgICBuZXdCaWxsLm5vdGVzID8/IG51bGwsXHJcbiAgICAgICAgbmV3QmlsbC5nc3RpbiA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuY29tcGFueU5hbWUgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLmNvbXBhbnlBZGRyZXNzID8/IG51bGwsXHJcbiAgICAgICAgbmV3QmlsbC5jb21wYW55UGhvbmUgPz8gbnVsbCxcclxuICAgICAgICBuZXdCaWxsLmNvbXBhbnlFbWFpbCA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuYmlsbEZvcm1hdCA/PyBudWxsLFxyXG4gICAgICAgIG5ld0JpbGwuY3JlYXRlZEJ5ID8/IG51bGwsXHJcbiAgICAgIF1cclxuICAgICk7XHJcblxyXG4gICAgLy8gVGhlbiBpbnNlcnQgYmlsbCBpdGVtc1xyXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIG5ld0JpbGwuaXRlbXMpIHtcclxuICAgICAgYXdhaXQgY29ubmVjdGlvbi5leGVjdXRlKFxyXG4gICAgICAgICdJTlNFUlQgSU5UTyBCaWxsSXRlbXMgKGJpbGxJZCwgcHJvZHVjdElkLCBuYW1lLCBxdWFudGl0eSwgcHJpY2UsIHRvdGFsLCB0YXgsIGdzdFJhdGUsIGJhcmNvZGVzKSBWQUxVRVMgKD8sID8sID8sID8sID8sID8sID8sID8sID8pJyxcclxuICAgICAgICBbbmV3QmlsbC5pZCwgaXRlbS5wcm9kdWN0SWQsIGl0ZW0ubmFtZSwgaXRlbS5xdWFudGl0eSwgaXRlbS5wcmljZSwgaXRlbS50b3RhbCwgaXRlbS50YXgsIGl0ZW0uZ3N0UmF0ZSwgaXRlbS5iYXJjb2Rlc11cclxuICAgICAgKTtcclxuXHJcbiAgICAgIGlmIChpdGVtLnByb2R1Y3RJZCkge1xyXG4gICAgICAgIGF3YWl0IGNvbm5lY3Rpb24uZXhlY3V0ZShcclxuICAgICAgICAgICdVUERBVEUgUHJvZHVjdHMgU0VUIHN0b2NrID0gc3RvY2sgLSA/IFdIRVJFIGlkID0gPycsXHJcbiAgICAgICAgICBbaXRlbS5xdWFudGl0eSwgaXRlbS5wcm9kdWN0SWRdXHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgYXdhaXQgY29ubmVjdGlvbi5jb21taXQoKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgYXdhaXQgY29ubmVjdGlvbi5yb2xsYmFjaygpO1xyXG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW5zZXJ0aW5nIGJpbGwgaW50byBNeVNRTDonLCBlcnJvcik7XHJcbiAgICAvLyBPcHRpb25hbGx5LCBoYW5kbGUgdGhlIGVycm9yIG1vcmUgZ3JhY2VmdWxseVxyXG4gIH0gZmluYWxseSB7XHJcbiAgICBjb25uZWN0aW9uLnJlbGVhc2UoKTtcclxuICB9XHJcblxyXG4gIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihuZXdCaWxsLCB7IHN0YXR1czogMjAxIH0pO1xyXG59XHJcbiJdLCJuYW1lcyI6WyJOZXh0UmVzcG9uc2UiLCJmcyIsInBhdGgiLCJsb2dDaGFuZ2UiLCJwb29sIiwiYmlsbHNKc29uUGF0aCIsInJlc29sdmUiLCJwcm9jZXNzIiwiY3dkIiwicHJvZHVjdHNKc29uUGF0aCIsImdldEJpbGxzIiwiZGF0YSIsInJlYWRGaWxlIiwiSlNPTiIsInBhcnNlIiwiZXJyb3IiLCJjb2RlIiwic2F2ZUJpbGwiLCJiaWxsIiwiYmlsbHMiLCJwdXNoIiwid3JpdGVGaWxlIiwic3RyaW5naWZ5IiwiR0VUIiwianNvbiIsIlBPU1QiLCJyZXF1ZXN0IiwibmV3QmlsbCIsImlkIiwicHJvZHVjdHNEYXRhIiwicHJvZHVjdHMiLCJpdGVtIiwiaXRlbXMiLCJwcm9kdWN0SW5kZXgiLCJmaW5kSW5kZXgiLCJwIiwicHJvZHVjdElkIiwic3RvY2siLCJxdWFudGl0eSIsImNvbnNvbGUiLCJjb25uZWN0aW9uIiwiZ2V0Q29ubmVjdGlvbiIsImJlZ2luVHJhbnNhY3Rpb24iLCJjcmVhdGVkQnkiLCJyb3dzIiwiZXhlY3V0ZSIsImxlbmd0aCIsInJvbGxiYWNrIiwicmVsZWFzZSIsIm1lc3NhZ2UiLCJzdGF0dXMiLCJzdG9yZUlkIiwic3RvcmVOYW1lIiwic3RvcmVBZGRyZXNzIiwiY3VzdG9tZXJOYW1lIiwiY3VzdG9tZXJQaG9uZSIsImN1c3RvbWVyRW1haWwiLCJjdXN0b21lckFkZHJlc3MiLCJjdXN0b21lcklkIiwic3VidG90YWwiLCJ0YXhQZXJjZW50YWdlIiwidGF4QW1vdW50IiwiZGlzY291bnRQZXJjZW50YWdlIiwiZGlzY291bnRBbW91bnQiLCJ0b3RhbCIsInBheW1lbnRNZXRob2QiLCJ0aW1lc3RhbXAiLCJub3RlcyIsImdzdGluIiwiY29tcGFueU5hbWUiLCJjb21wYW55QWRkcmVzcyIsImNvbXBhbnlQaG9uZSIsImNvbXBhbnlFbWFpbCIsImJpbGxGb3JtYXQiLCJuYW1lIiwicHJpY2UiLCJ0YXgiLCJnc3RSYXRlIiwiYmFyY29kZXMiLCJjb21taXQiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/api/bills/route.ts\n");

/***/ }),

/***/ "(rsc)/./app/utils/logger.ts":
/*!*****************************!*\
  !*** ./app/utils/logger.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   createLog: () => (/* binding */ createLog),\n/* harmony export */   logChange: () => (/* binding */ logChange)\n/* harmony export */ });\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! fs */ \"fs\");\n/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! path */ \"path\");\n/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_1__);\n\n\nconst logsDir = path__WEBPACK_IMPORTED_MODULE_1___default().join(process.cwd(), 'app', 'data', 'logs');\nif (!fs__WEBPACK_IMPORTED_MODULE_0___default().existsSync(logsDir)) {\n    fs__WEBPACK_IMPORTED_MODULE_0___default().mkdirSync(logsDir, {\n        recursive: true\n    });\n}\nconst logChange = (fileName, change)=>{\n    const logFilePath = path__WEBPACK_IMPORTED_MODULE_1___default().join(logsDir, `${fileName}.log`);\n    const timestamp = new Date().toISOString();\n    const logMessage = `${timestamp} - ${change}\\n`;\n    fs__WEBPACK_IMPORTED_MODULE_0___default().appendFileSync(logFilePath, logMessage);\n};\nconst createLog = async (logFilePath, content)=>{\n    await fs__WEBPACK_IMPORTED_MODULE_0___default().promises.writeFile(logFilePath, content, \"utf-8\");\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvdXRpbHMvbG9nZ2VyLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFvQjtBQUNJO0FBRXhCLE1BQU1FLFVBQVVELGdEQUFTLENBQUNHLFFBQVFDLEdBQUcsSUFBSSxPQUFPLFFBQVE7QUFFeEQsSUFBSSxDQUFDTCxvREFBYSxDQUFDRSxVQUFVO0lBQzNCRixtREFBWSxDQUFDRSxTQUFTO1FBQUVNLFdBQVc7SUFBSztBQUMxQztBQUVPLE1BQU1DLFlBQVksQ0FBQ0MsVUFBa0JDO0lBQzFDLE1BQU1DLGNBQWNYLGdEQUFTLENBQUNDLFNBQVMsR0FBR1EsU0FBUyxJQUFJLENBQUM7SUFDeEQsTUFBTUcsWUFBWSxJQUFJQyxPQUFPQyxXQUFXO0lBQ3hDLE1BQU1DLGFBQWEsR0FBR0gsVUFBVSxHQUFHLEVBQUVGLE9BQU8sRUFBRSxDQUFDO0lBRS9DWCx3REFBaUIsQ0FBQ1ksYUFBYUk7QUFDakMsRUFBRTtBQUVLLE1BQU1FLFlBQVksT0FBT04sYUFBcUJPO0lBQ25ELE1BQU1uQixrREFBVyxDQUFDcUIsU0FBUyxDQUFDVCxhQUFhTyxTQUFTO0FBQ3BELEVBQUUiLCJzb3VyY2VzIjpbIkU6XFxiaWxsaW5nLWFwcFxcYXBwXFx1dGlsc1xcbG9nZ2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuY29uc3QgbG9nc0RpciA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnYXBwJywgJ2RhdGEnLCAnbG9ncycpO1xyXG5cclxuaWYgKCFmcy5leGlzdHNTeW5jKGxvZ3NEaXIpKSB7XHJcbiAgZnMubWtkaXJTeW5jKGxvZ3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgbG9nQ2hhbmdlID0gKGZpbGVOYW1lOiBzdHJpbmcsIGNoYW5nZTogc3RyaW5nKSA9PiB7XHJcbiAgY29uc3QgbG9nRmlsZVBhdGggPSBwYXRoLmpvaW4obG9nc0RpciwgYCR7ZmlsZU5hbWV9LmxvZ2ApO1xyXG4gIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICBjb25zdCBsb2dNZXNzYWdlID0gYCR7dGltZXN0YW1wfSAtICR7Y2hhbmdlfVxcbmA7XHJcblxyXG4gIGZzLmFwcGVuZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCBsb2dNZXNzYWdlKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBjcmVhdGVMb2cgPSBhc3luYyAobG9nRmlsZVBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKSA9PiB7XHJcbiAgYXdhaXQgZnMucHJvbWlzZXMud3JpdGVGaWxlKGxvZ0ZpbGVQYXRoLCBjb250ZW50LCBcInV0Zi04XCIpO1xyXG59O1xyXG4iXSwibmFtZXMiOlsiZnMiLCJwYXRoIiwibG9nc0RpciIsImpvaW4iLCJwcm9jZXNzIiwiY3dkIiwiZXhpc3RzU3luYyIsIm1rZGlyU3luYyIsInJlY3Vyc2l2ZSIsImxvZ0NoYW5nZSIsImZpbGVOYW1lIiwiY2hhbmdlIiwibG9nRmlsZVBhdGgiLCJ0aW1lc3RhbXAiLCJEYXRlIiwidG9JU09TdHJpbmciLCJsb2dNZXNzYWdlIiwiYXBwZW5kRmlsZVN5bmMiLCJjcmVhdGVMb2ciLCJjb250ZW50IiwicHJvbWlzZXMiLCJ3cml0ZUZpbGUiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/utils/logger.ts\n");

/***/ }),

/***/ "(rsc)/./lib/mysql.ts":
/*!**********************!*\
  !*** ./lib/mysql.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   connectToDatabase: () => (/* binding */ connectToDatabase),\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony import */ var mysql2_promise__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! mysql2/promise */ \"(rsc)/./node_modules/mysql2/promise.js\");\n\n// Create the connection pool. The pool-specific settings are the defaults\nconst pool = mysql2_promise__WEBPACK_IMPORTED_MODULE_0__.createPool({\n    host: '86.38.243.155',\n    user: 'u408450631_siri',\n    password: 'Siriart@2025',\n    database: 'u408450631_siri',\n    waitForConnections: true,\n    connectionLimit: 10,\n    queueLimit: 0\n});\nasync function connectToDatabase() {\n    return await pool.getConnection();\n}\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (pool);\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9saWIvbXlzcWwudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQW1DO0FBRW5DLDBFQUEwRTtBQUMxRSxNQUFNQyxPQUFPRCxzREFBZ0IsQ0FBQztJQUM1QkcsTUFBTTtJQUNOQyxNQUFNO0lBQ05DLFVBQVU7SUFDVkMsVUFBVTtJQUNWQyxvQkFBb0I7SUFDcEJDLGlCQUFpQjtJQUNqQkMsWUFBWTtBQUNkO0FBRU8sZUFBZUM7SUFDcEIsT0FBTyxNQUFNVCxLQUFLVSxhQUFhO0FBQ2pDO0FBRUEsaUVBQWVWLElBQUlBLEVBQUMiLCJzb3VyY2VzIjpbIkU6XFxiaWxsaW5nLWFwcFxcbGliXFxteXNxbC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbXlzcWwgZnJvbSAnbXlzcWwyL3Byb21pc2UnO1xyXG5cclxuLy8gQ3JlYXRlIHRoZSBjb25uZWN0aW9uIHBvb2wuIFRoZSBwb29sLXNwZWNpZmljIHNldHRpbmdzIGFyZSB0aGUgZGVmYXVsdHNcclxuY29uc3QgcG9vbCA9IG15c3FsLmNyZWF0ZVBvb2woe1xyXG4gIGhvc3Q6ICc4Ni4zOC4yNDMuMTU1JyxcclxuICB1c2VyOiAndTQwODQ1MDYzMV9zaXJpJyxcclxuICBwYXNzd29yZDogJ1NpcmlhcnRAMjAyNScsXHJcbiAgZGF0YWJhc2U6ICd1NDA4NDUwNjMxX3NpcmknLFxyXG4gIHdhaXRGb3JDb25uZWN0aW9uczogdHJ1ZSxcclxuICBjb25uZWN0aW9uTGltaXQ6IDEwLFxyXG4gIHF1ZXVlTGltaXQ6IDBcclxufSk7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29ubmVjdFRvRGF0YWJhc2UoKSB7XHJcbiAgcmV0dXJuIGF3YWl0IHBvb2wuZ2V0Q29ubmVjdGlvbigpO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBwb29sO1xyXG4iXSwibmFtZXMiOlsibXlzcWwiLCJwb29sIiwiY3JlYXRlUG9vbCIsImhvc3QiLCJ1c2VyIiwicGFzc3dvcmQiLCJkYXRhYmFzZSIsIndhaXRGb3JDb25uZWN0aW9ucyIsImNvbm5lY3Rpb25MaW1pdCIsInF1ZXVlTGltaXQiLCJjb25uZWN0VG9EYXRhYmFzZSIsImdldENvbm5lY3Rpb24iXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./lib/mysql.ts\n");

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

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fbills%2Froute&page=%2Fapi%2Fbills%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fbills%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D!":
/*!*******************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fbills%2Froute&page=%2Fapi%2Fbills%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fbills%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D! ***!
  \*******************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var E_billing_app_app_api_bills_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/bills/route.ts */ \"(rsc)/./app/api/bills/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"export\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/bills/route\",\n        pathname: \"/api/bills\",\n        filename: \"route\",\n        bundlePath: \"app/api/bills/route\"\n    },\n    resolvedPagePath: \"E:\\\\billing-app\\\\app\\\\api\\\\bills\\\\route.ts\",\n    nextConfigOutput,\n    userland: E_billing_app_app_api_bills_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZiaWxscyUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGYmlsbHMlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZiaWxscyUyRnJvdXRlLnRzJmFwcERpcj1FJTNBJTVDYmlsbGluZy1hcHAlNUNhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPUUlM0ElNUNiaWxsaW5nLWFwcCZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD1leHBvcnQmcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBK0Y7QUFDdkM7QUFDcUI7QUFDTjtBQUN2RTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiRTpcXFxcYmlsbGluZy1hcHBcXFxcYXBwXFxcXGFwaVxcXFxiaWxsc1xcXFxyb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJleHBvcnRcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvYmlsbHMvcm91dGVcIixcbiAgICAgICAgcGF0aG5hbWU6IFwiL2FwaS9iaWxsc1wiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvYmlsbHMvcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCJFOlxcXFxiaWxsaW5nLWFwcFxcXFxhcHBcXFxcYXBpXFxcXGJpbGxzXFxcXHJvdXRlLnRzXCIsXG4gICAgbmV4dENvbmZpZ091dHB1dCxcbiAgICB1c2VybGFuZFxufSk7XG4vLyBQdWxsIG91dCB0aGUgZXhwb3J0cyB0aGF0IHdlIG5lZWQgdG8gZXhwb3NlIGZyb20gdGhlIG1vZHVsZS4gVGhpcyBzaG91bGRcbi8vIGJlIGVsaW1pbmF0ZWQgd2hlbiB3ZSd2ZSBtb3ZlZCB0aGUgb3RoZXIgcm91dGVzIHRvIHRoZSBuZXcgZm9ybWF0LiBUaGVzZVxuLy8gYXJlIHVzZWQgdG8gaG9vayBpbnRvIHRoZSByb3V0ZS5cbmNvbnN0IHsgd29ya0FzeW5jU3RvcmFnZSwgd29ya1VuaXRBc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzIH0gPSByb3V0ZU1vZHVsZTtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgd29ya0FzeW5jU3RvcmFnZSxcbiAgICAgICAgd29ya1VuaXRBc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCB3b3JrQXN5bmNTdG9yYWdlLCB3b3JrVW5pdEFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MsIHBhdGNoRmV0Y2gsICB9O1xuXG4vLyMgc291cmNlTWFwcGluZ1VSTD1hcHAtcm91dGUuanMubWFwIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fbills%2Froute&page=%2Fapi%2Fbills%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fbills%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D!\n");

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
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/mysql2","vendor-chunks/iconv-lite","vendor-chunks/aws-ssl-profiles","vendor-chunks/sqlstring","vendor-chunks/seq-queue","vendor-chunks/named-placeholders","vendor-chunks/long","vendor-chunks/safer-buffer","vendor-chunks/lru.min","vendor-chunks/is-property","vendor-chunks/generate-function","vendor-chunks/denque"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fbills%2Froute&page=%2Fapi%2Fbills%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fbills%2Froute.ts&appDir=E%3A%5Cbilling-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5Cbilling-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=export&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();