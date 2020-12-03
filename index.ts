import { WalmartBot, WalmartBotConfig } from './WalmartBot'

const config:WalmartBotConfig = {
    items:[
        {
            url:'https://www.walmart.com/ip/onn-Portable-Battery-1x-Charge-3350-mAh-Pink/435644048',
            quantity:1
        }
    ],
    email:'maxmfishernj@gmail.com',
    password:'f$3V&Bb*T1QQ',
    cvv:'',
    oldApi:false,
    pollTime:5000,
    devMode:true,
}

new WalmartBot(config)

