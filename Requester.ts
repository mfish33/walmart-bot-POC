import * as fetch from 'node-fetch'

type responseOutput = 'json' | 'text' | 'blob' | 'arrayBuffer'

export default class Requester{
    private retryCount = 5
    private delay = 100

    constructor(
        private reqFn:()=>Promise<fetch.Response>,
        private resolve:Function,
        private reject:Function,
        private resType:responseOutput
    ){
        this.execute()
    }

    private async execute() {
        try{
            let res = await this.reqFn()
            if(res.status == 200 || res.status == 201) {
                return this.createOutput(res)
            }
            throw `${this.reqFn.name.slice(0, -1)} request had status: ${res.status} and body: ${await res.text()}`
        } catch(e) {
            if(this.retryCount) {
                this.retryCount--
                setTimeout(this.execute.bind(this),this.delay)
                return
            }
            this.reject(e)
        }
    }

    private async createOutput(res:fetch.Response) {
        switch (this.resType) {
            case 'json':
                return this.resolve(await res.json())
            case 'text':
                return this.resolve(await res.text())
            case 'blob':
                return this.resolve(await res.blob())
            case 'arrayBuffer':
                return this.resolve(await res.arrayBuffer())
        }
    }

    static create(reqFn:()=>Promise<fetch.Response>, resType:responseOutput):Promise<any> {
        return new Promise((resolve,reject) => {
            new Requester(reqFn,resolve,reject,resType)
        })
    }
}