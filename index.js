const nodeFetch = require('node-fetch')
const fetch = require('fetch-cookie')(nodeFetch)
const walmartEncrypt = require('./encrypt')
const mobileUserAgent = 'Walmart/2011052309 CFNetwork/1206 Darwin/20.1.0'


const config = {
    url:'',
    email:'',
    password:'',
    cvv:'',

    // These could be optimized out by changing the flow slightly and would not be in the final version
    city:'',
    country:'',
    state:'',
    zip:'',
    country:''
}

const runBot = async () => {
    console.time('tester')
    await login()
    let productId = await getId(config,url)
    await addToCart(productId)
    await checkout()
    console.timeEnd('tester')

}

const login = async () => {
    let loginReq = await fetch("https://www.walmart.com/account/electrode/api/identity/password",{
        method:'POST',
        headers:{
            "User-Agent":mobileUserAgent,
            "Content-Type":"text/plain;charset=UTF-8"
        },
        body:JSON.stringify({
            email:config.email,
            password:config.password
        })
    })
}

const addToCart = async (offerId) => {
    let cartReq = await fetch("https://api.mobile.walmart.com/v1/cart/items",{
        method:'POST',
        headers:{
            "User-Agent":mobileUserAgent,
            "Content-Type":"application/json",
        },
        body:JSON.stringify({
            "location": {
                "city": config.city,
                "country": config.country,
                "isZipLocated": true,
                "postalCode": config.zip,
                "state": config.state
            },
            "offerId": offerId,
            
            "quantity": 1,
        })
    })
}

const getId = async (url) => {
    let pageReq = await fetch(url,{
        headers:{
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.69 Safari/537.36"
        }
    })
    let text = await pageReq.text()
    if(!text.match('Add to cart')) {
        return null
    }
    // 1 since it is getting the id
    let offerId = text.match(/"offerId":"((?:\d|\w)+)/)[1]
    return offerId
}

const checkout = async () => {

    let contractP = () => fetch('https://www.walmart.com/api/checkout/v3/contract',{
        method:'POST',
        headers:{
            "User-Agent":mobileUserAgent,
            "Content-Type":"application/json",
        },
        body:JSON.stringify({
            "city": config.city,
            "crt:CRT": "",
            "customerId:CID": "",
            "customerType:type": "",
            "isZipLocated": true,
            "postalCode": config.zip,
            "state": config.state
          })
    }).then(res=>res.json())

    // can skip a step if billing is the same as shipping
    let cardInfoP = () => fetch('https://www.walmart.com//api/checkout-customer/:CID/credit-card',{
        headers:{
            'User-Agent':mobileUserAgent
        }
    }).then(res=>res.json())

    const PIEDataP = () => fetch('https://securedataweb.walmart.com/pie/v1/wmcom_us_vtg_pie/getkey.js?bust='+(new Date).getTime(),{
        headers:{
            'User-Agent':mobileUserAgent
        }
    }).then(res=>res.text())

    let [contract, cardInfo, PIEData] = await Promise.all([contractP(),cardInfoP(),PIEDataP()])

    eval(PIEData)

    let productCheckoutId = contract.items[0].id

    let submitItemsP = () => fetch('https://www.walmart.com/api/checkout/v3/contract/:PCID/fulfillment',{
        method:'POST',
        headers:{
            "User-Agent":mobileUserAgent,
            "Content-Type":"application/json",
        },
        body:JSON.stringify({
            "groups": [
                {
                    "fulfillmentOption": "S2H",
                    "itemIds": [
                        productCheckoutId
                    ],
                    "shipMethod": "EXPEDITED"
                }
            ]
        })
    }).then(res=>res.json())



    let submitShippingAddressP = () => fetch('https://www.walmart.com/api/checkout/v3/contract/:PCID/shipping-address',{
        method:'POST',
        headers:{
            'User-Agent':mobileUserAgent,
            "Content-Type":"application/json",
        },
        body:JSON.stringify({
            "addressLineOne":cardInfo[0].addressLineOne,
            "addressLineTwo": cardInfo[0].addressLineTwo,
            "addressType": "RESIDENTIAL",
            "changedFields": [],
            "city": cardInfo[0].city,
            "firstName": cardInfo[0].firstName,
            "lastName": cardInfo[0].lastName,
            "phone": cardInfo[0].phone,
            "postalCode": cardInfo[0].postalCode,
            "preferenceId": cardInfo[0].id,
            "state": cardInfo[0].state,
            "storeList": []
        })
    }).then(res=>res.json())

    const [ encryptedPan, encryptedCvv, integrityCheck ] = walmartEncrypt('4111111111111111', config.cvv, PIE.L, PIE.E, PIE.K, PIE.key_id, PIE.phase)

    let submitPaymentP = () => fetch('https://www.walmart.com/api/checkout/v3/contract/:PCID/payment',{
        method:'POST',
        headers:{
            'User-Agent':mobileUserAgent,
            "Content-Type":"application/json",
        },
        body:JSON.stringify({
            "cvvInSession": true,
            "payments": [
                {
                    "addressLineOne":cardInfo[0].addressLineOne,
                    "addressLineTwo": cardInfo[0].addressLineTwo,
                    "cardType": "MASTERCARD",
                    "city": cardInfo[0].city,
                    "encryptedCvv": encryptedCvv,
                    "encryptedPan": encryptedPan,
                    "expiryMonth": 12,
                    "expiryYear": 2023,
                    "firstName": cardInfo[0].firstName,
                    "integrityCheck": integrityCheck,
                    "isTemp": false,
                    "keyId": PIE.key_id,
                    "lastName": cardInfo[0].lastName,
                    "paymentType": "CREDITCARD",
                    "phase": "1",
                    "phone": cardInfo[0].phone,
                    "piHash": cardInfo[0].piHash,
                    "postalCode": cardInfo[0].postalCode,
                    "preferenceId": cardInfo[0].id,
                    "state": cardInfo[0].state,
                }
            ],
        })
    }).then(res=>res.json())


    let [submitItems, submitPayment, submitShippingAddress] = await Promise.all([submitItemsP(),submitPaymentP(),submitShippingAddressP()])


    let submitOrder = await fetch('https://www.walmart.com/api/checkout/v3/contract/:PCID/order',{
        method:'PUT',
        headers:{
            "content-type": "application/json",
            "origin": "https://www.walmart.com",
            "referer": "https://www.walmart.com/checkout/",
            "user-agent": mobileUserAgent,
        },
        body:JSON.stringify({
            "cvvInSession": true,
            "voltagePayments": [
                {
                    "encryptedCvv": encryptedCvv,
                    "encryptedPan": encryptedPan,
                    "integrityCheck": integrityCheck,
                    "keyId": PIE.key_id,
                    "paymentType": "CREDITCARD",
                    "phase": "1",
                    "preferenceId":cardInfo[0].id
                }
            ]
        })
    })

    console.log(await submitOrder.text())

}

runBot()