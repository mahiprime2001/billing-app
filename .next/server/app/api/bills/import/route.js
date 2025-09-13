(()=>{var e={};e.id=44,e.ids=[44],e.modules={2770:(e,t,r)=>{"use strict";r.r(t),r.d(t,{patchFetch:()=>h,routeModule:()=>x,serverHooks:()=>U,workAsyncStorage:()=>g,workUnitAsyncStorage:()=>y});var s={};r.r(s),r.d(s,{POST:()=>S});var o=r(96559),i=r(48088),a=r(37719),n=r(32190),l=r(79748),u=r.n(l),c=r(33873),d=r.n(c),p=r(42996),m=r(15942);let A=d().join(process.cwd(),"app","data","json","bills.json"),E=d().join(process.cwd(),"app","data","logs","bills.json.log");async function S(e){try{let t=await e.json(),r=[];try{let e=await u().readFile(A,"utf-8");r=JSON.parse(e)}catch(e){if("ENOENT"!==e.code)return console.error("Error reading existing bills.json:",e),n.NextResponse.json({message:"Failed to read existing bills data"},{status:500});console.warn("bills.json not found, starting with an empty array.")}let s=[],o=[],i=[];for(let e of t)r.some(t=>t.id===e.id)?(o.push(e),i.push(`[INFO] Bill with ID ${e.id} already exists. Skipping.`)):(s.push(e),i.push(`[INFO] New bill with ID ${e.id} imported.`));if(s.length>0){let e=[...r,...s];await u().writeFile(A,JSON.stringify(e,null,2),"utf-8"),i.push(`[SUCCESS] ${s.length} new bills added to bills.json.`);let t=await (0,p.$)();for(let e of s){let r=`
          INSERT INTO Bills (id, storeId, storeName, storeAddress, customerName, customerEmail, customerPhone, customerAddress, customerId, subtotal, taxPercentage, taxAmount, discountPercentage, discountAmount, total, paymentMethod, timestamp, notes, gstin, companyName, companyAddress, companyPhone, companyEmail, billFormat, createdBy)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            storeId = VALUES(storeId),
            storeName = VALUES(storeName),
            storeAddress = VALUES(storeAddress),
            customerName = VALUES(customerName),
            customerEmail = VALUES(customerEmail),
            customerPhone = VALUES(customerPhone),
            customerAddress = VALUES(customerAddress),
            customerId = VALUES(customerId),
            subtotal = VALUES(subtotal),
            taxPercentage = VALUES(taxPercentage),
            taxAmount = VALUES(taxAmount),
            discountPercentage = VALUES(discountPercentage),
            discountAmount = VALUES(discountAmount),
            total = VALUES(total),
            paymentMethod = VALUES(paymentMethod),
            timestamp = VALUES(timestamp),
            notes = VALUES(notes),
            gstin = VALUES(gstin),
            companyName = VALUES(companyName),
            companyAddress = VALUES(companyAddress),
            companyPhone = VALUES(companyPhone),
            companyEmail = VALUES(companyEmail),
            billFormat = VALUES(billFormat),
            createdBy = VALUES(createdBy)
        `;if(await t.execute(r,[e.id,e.storeId||null,e.storeName||null,e.storeAddress||null,e.customerName||null,e.customerEmail||null,e.customerPhone||null,e.customerAddress||null,e.customerId||null,e.subtotal,e.taxPercentage||0,e.taxAmount,e.discountPercentage,e.discountAmount,e.total,e.paymentMethod||null,e.timestamp,e.notes||null,e.gstin||null,e.companyName||null,e.companyAddress||null,e.companyPhone||null,e.companyEmail||null,e.billFormat||null,e.createdBy||null]),e.items&&e.items.length>0)for(let r of e.items){let s=`
              INSERT INTO BillItems (billId, productId, productName, quantity, price, total, tax, gstRate, barcodes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                productId = VALUES(productId),
                productName = VALUES(productName),
                quantity = VALUES(quantity),
                price = VALUES(price),
                total = VALUES(total),
                tax = VALUES(tax),
                gstRate = VALUES(gstRate),
                barcodes = VALUES(barcodes)
            `;await t.execute(s,[e.id,r.productId||null,r.productName||null,r.quantity,r.price,r.total,r.tax||0,r.gstRate||0,r.barcodes||null])}}i.push(`[SUCCESS] ${s.length} new bills uploaded to MySQL.`)}else i.push("[INFO] No new bills to add.");return await (0,m.h)(E,i.join("\n")),i.push(`[SUCCESS] Import log created at ${E}`),n.NextResponse.json({message:"Bills import process completed",newBillsCount:s.length,commonBillsCount:o.length,log:i})}catch(e){return console.error("Error during bills import:",e),n.NextResponse.json({message:"Internal server error during bills import"},{status:500})}}let x=new o.AppRouteRouteModule({definition:{kind:i.RouteKind.APP_ROUTE,page:"/api/bills/import/route",pathname:"/api/bills/import",filename:"route",bundlePath:"app/api/bills/import/route"},resolvedPagePath:"/Users/mahendrareddy/developer/billing_system/billing-app/app/api/bills/import/route.ts",nextConfigOutput:"",userland:s}),{workAsyncStorage:g,workUnitAsyncStorage:y,serverHooks:U}=x;function h(){return(0,a.patchFetch)({workAsyncStorage:g,workUnitAsyncStorage:y})}},3295:e=>{"use strict";e.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},10846:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},15942:(e,t,r)=>{"use strict";r.d(t,{B:()=>l,h:()=>u});var s=r(29021),o=r.n(s),i=r(33873),a=r.n(i);let n=a().join(process.cwd(),"app","data","logs");o().existsSync(n)||o().mkdirSync(n,{recursive:!0});let l=(e,t)=>{let r=a().join(n,`${e}.log`),s=new Date().toISOString(),i=`${s} - ${t}
`;o().appendFileSync(r,i)},u=async(e,t)=>{await o().promises.writeFile(e,t,"utf-8")}},19771:e=>{"use strict";e.exports=require("process")},27910:e=>{"use strict";e.exports=require("stream")},28303:e=>{function t(e){var t=Error("Cannot find module '"+e+"'");throw t.code="MODULE_NOT_FOUND",t}t.keys=()=>[],t.resolve=t,t.id=28303,e.exports=t},28354:e=>{"use strict";e.exports=require("util")},29021:e=>{"use strict";e.exports=require("fs")},29294:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-async-storage.external.js")},33873:e=>{"use strict";e.exports=require("path")},34631:e=>{"use strict";e.exports=require("tls")},41204:e=>{"use strict";e.exports=require("string_decoder")},42996:(e,t,r)=>{"use strict";r.d(t,{$:()=>o,A:()=>i});let s=r(46101).createPool({host:"86.38.243.155",user:"u408450631_siri",password:"Siriart@2025",database:"u408450631_siri",waitForConnections:!0,connectionLimit:10,queueLimit:0});async function o(){return await s.getConnection()}let i=s},44870:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},55511:e=>{"use strict";e.exports=require("crypto")},63033:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},66136:e=>{"use strict";e.exports=require("timers")},74075:e=>{"use strict";e.exports=require("zlib")},78335:()=>{},79428:e=>{"use strict";e.exports=require("buffer")},79551:e=>{"use strict";e.exports=require("url")},79748:e=>{"use strict";e.exports=require("fs/promises")},91645:e=>{"use strict";e.exports=require("net")},94735:e=>{"use strict";e.exports=require("events")},96487:()=>{}};var t=require("../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),s=t.X(0,[447,580,101],()=>r(2770));module.exports=s})();