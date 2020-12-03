import nodeFetch from 'node-fetch'
import fetchCookie from 'fetch-cookie'
import walmartEncrypt from './encrypt'
import Requester from './Requester'

const mobileUserAgent = 'Walmart/2011052309 CFNetwork/1206 Darwin/20.1.0'

export interface WalmartBotConfig {
    items:item[]
    email:string
    password:string
    cvv:string,
    pollTime:number,
    oldApi:boolean
    botName?:string,
    devMode?:boolean
}

export interface item{
    url:string
    quantity:number,
    keepBuying?:boolean
}

export interface itemWithID extends item {
    id:string
}

export class WalmartBot{

    private cardData:any = {}
    private shippingData:any = {}
    private PIE:any = {}
    // Create fetch instance to hold cookies for this bot
    private fetch = fetchCookie(nodeFetch)
 
    constructor(private config:WalmartBotConfig){
        this.init()
    }

    async init(){
        await this.login()
        await this.getUserInfo()
        this.runBot()
    }

    async runBot() {
        try{

            let products:itemWithID[] = []
            while(!products.length) {
                products = (await Promise.all(
                    this.config.items.map(item => this.getId(item))
                )).filter(product => product.id)
                if(!products.length) {
                    // Easiest way to do a sleep in js
                    await new Promise(resolve => setTimeout(resolve,this.config.pollTime))
                }
            }

            await Promise.allSettled(products.map(product => this.addToCart(product)))
            await this.checkout()

            console.log(`The bot successfully checked out with:\n${products.map(p=>p.url).join('\n')}`)

            if(products.length < this.config.items.length) {
                let productUrls = products.map(product => product.url)
                this.config.items = this.config.items.filter(item => !productUrls.includes(item.url) && !item.keepBuying)
                console.log(`continue trying for:\n${this.config.items.map(p=>p.url).join('\n')}`)
            }

        } catch(e) {
            console.error(e)
            console.error('kicking bot back to polling')
            this.runBot()
        }
        
        console.log(`${this.config.botName ? this.config.botName : 'Walmart'} bot finished executing`)
    }
    
    async login() {
        let loginP = () => this.fetch("https://www.walmart.com/account/electrode/api/identity/password",{
            method:'POST',
            headers:{
                "User-Agent":mobileUserAgent,
                "Content-Type":"text/plain;charset=UTF-8",
                'mobile-platform':'ios',
                'mobile-app-version':'20.41.5'
            },
            body:JSON.stringify({
                email:this.config.email,
                password:this.config.password
            })
        })
        await Requester.create(loginP,'text')
    }

    async getUserInfo() {
        let cardInfoP = () => this.fetch('https://www.walmart.com//api/checkout-customer/:CID/credit-card',{
            headers:{
                'User-Agent':mobileUserAgent
            }
        })
        let shippingInfoP = () => this.fetch('https://www.walmart.com/api/checkout-customer/:CID/shipping-address',{
            headers:{
                'User-Agent':mobileUserAgent
            }
        })
        let [cardData,shippingData] = await Promise.all([
            Requester.create(cardInfoP,'json'),
            Requester.create(shippingInfoP,'json')
            ])
        this.cardData = cardData[0]
        this.shippingData = shippingData[0]
    }
    
    async addToCart(item:itemWithID) {
        const addToCartP = () => this.fetch("https://api.mobile.walmart.com/v1/cart/items",{
            method:'POST',
            headers:{
                "User-Agent":mobileUserAgent,
                "Content-Type":"application/json",
            },
            body:JSON.stringify({
                "location": {
                    "city": this.shippingData.city,
                    "country": this.shippingData.country,
                    "isZipLocated": true,
                    "postalCode": this.shippingData.postalCode,
                    "state": this.shippingData.state
                },
                "offerId": item.id,
                "quantity": item.quantity,
            })
        })
        await Requester.create(addToCartP,'json')
    }
    
    async getId(item:item):Promise<itemWithID> {
        // Use nodeFetch to not send mobile session cookies
        let pageReq = await nodeFetch(item.url,{
            headers:{
                "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.69 Safari/537.36"
            }
        })
        let text = await pageReq.text()
        if(!text.match('Add to cart')) {
            return { id:'' , ...item }
        }
        let offerId = text.match(/"offerId":"((?:\d|\w)+)/)
        // null check since match can return null instead of empty array
        // 1 since it is getting the id
        return offerId ? { id:offerId[1],...item } : { id:'' , ...item }
    }
    
    async checkout() {
    
        let contractP = () => this.fetch('https://www.walmart.com/api/checkout/v3/contract',{
            method:'POST',
            headers:{
                "User-Agent":mobileUserAgent,
                "Content-Type":"application/json",
            },
            body:JSON.stringify({
                "city": this.shippingData.city,
                "crt:CRT": "",
                "customerId:CID": "",
                "customerType:type": "",
                "isZipLocated": true,
                "postalCode": this.shippingData.postalCode,
                "state": this.shippingData.state
              })
        })
    
        const PIEDataP = () => this.fetch('https://securedataweb.walmart.com/pie/v1/wmcom_us_vtg_pie/getkey.js?bust='+(new Date).getTime(),{
            headers:{
                'User-Agent':mobileUserAgent
            }
        })
    
        let [contract, PIEData] = await Promise.all([
            Requester.create(contractP,'json'),
            Requester.create(PIEDataP,'text'),
        ])
    

        let test = PIEData.replace('var PIE = {};','').replace(/PIE/g,'this.PIE')

        eval(test)

        let productCheckoutId = contract.items[0].id
    
        let submitItemsP = () => this.fetch('https://www.walmart.com/api/checkout/v3/contract/:PCID/fulfillment',{
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
        })
    
    
    
        let submitShippingAddressP = () => this.fetch('https://www.walmart.com/api/checkout/v3/contract/:PCID/shipping-address',{
            method:'POST',
            headers:{
                'User-Agent':mobileUserAgent,
                "Content-Type":"application/json",
            },
            body:JSON.stringify({
                "addressLineOne":this.shippingData.addressLineOne,
                "addressLineTwo": this.shippingData.addressLineTwo,
                "addressType": "RESIDENTIAL",
                "changedFields": [],
                "city": this.shippingData.city,
                "firstName": this.shippingData.firstName,
                "lastName": this.shippingData.lastName,
                "phone": this.shippingData.phone,
                "postalCode": this.shippingData.postalCode,
                "preferenceId": this.shippingData.id,
                "state": this.shippingData.state,
                "storeList": []
            })
        })
    
        const [ encryptedPan, encryptedCvv, integrityCheck ] = walmartEncrypt('4111111111111111', this.config.cvv, this.PIE.L, this.PIE.E, this.PIE.K, this.PIE.key_id, this.PIE.phase)
    
        let submitPaymentP = () => this.fetch('https://www.walmart.com/api/checkout/v3/contract/:PCID/payment',{
            method:'POST',
            headers:{
                'User-Agent':mobileUserAgent,
                "Content-Type":"application/json",
            },
            body:JSON.stringify({
                "cvvInSession": true,
                "payments": [
                    {
                        "addressLineOne":this.cardData.addressLineOne,
                        "addressLineTwo": this.cardData.addressLineTwo,
                        "cardType": "MASTERCARD",
                        "city": this.cardData.city,
                        "encryptedCvv": encryptedCvv,
                        "encryptedPan": encryptedPan,
                        "expiryMonth": 12,
                        "expiryYear": 2023,
                        "firstName": this.cardData.firstName,
                        "integrityCheck": integrityCheck,
                        "isTemp": false,
                        "keyId": this.PIE.key_id,
                        "lastName": this.cardData.lastName,
                        "paymentType": "CREDITCARD",
                        "phase": "1",
                        "phone": this.cardData.phone,
                        "piHash": this.cardData.piHash,
                        "postalCode": this.cardData.postalCode,
                        "preferenceId": this.cardData.id,
                        "state": this.cardData.state,
                    }
                ],
            })
        })

        // API changed on 11/29 This is here if this does not last and have to revert
        let submitItems, submitPayment, submitShippingAddress
        if(this.config.oldApi) {
            [ submitItems, submitPayment, submitShippingAddress] = await Promise.all([
                Requester.create(submitItemsP,'json'),
                Requester.create(submitPaymentP,'json'),
                Requester.create(submitShippingAddressP,'json')
            ])
        }

        let submitOrderBody:any = {
            "cvvInSession": true,
        }

        // API changed on 11/29 This is here if this does not last and have to revert
        if(this.config.oldApi) {
            submitOrderBody.voltagePayments = [
                {
                    encryptedCvv: encryptedCvv,
                    encryptedPan: encryptedPan,
                    integrityCheck: integrityCheck,
                    keyId: this.PIE.key_id,
                    paymentType: "CREDITCARD",
                    phase: "1",
                    preferenceId:this.cardData.id
                }
            ]
        }
    
        let submitOrderP = () => this.fetch('https://www.walmart.com/api/checkout/v3/contract/:PCID/order',{
            method:'PUT',
            headers:{
                "content-type": "application/json",
                "origin": "https://www.walmart.com",
                "referer": "https://www.walmart.com/checkout/",
                "user-agent": mobileUserAgent,
            },
            body:JSON.stringify(submitOrderBody)
        })

        if(!this.config.devMode) {
            await Requester.create(submitOrderP,'json')
        }
    
    }

}
