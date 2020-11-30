import { WalmartBot, WalmartBotConfig } from './WalmartBot'

const config:WalmartBotConfig = {
    url:'',
    email:'',
    password:'',
    cvv:'',
    oldApi:false,
    pollTime:5000,
}

new WalmartBot(config)

