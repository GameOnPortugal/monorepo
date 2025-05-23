import { type HttpClient } from '../../Domain/Http/HttpClient'
import axios, { type AxiosInstance } from 'axios'
import { injectable } from 'inversify'
import https from 'https'
import * as http from 'http'

@injectable()
export default class AxiosHttpClient implements HttpClient {
  private readonly axios: AxiosInstance

  constructor () {
    this.axios = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined
      }),
      httpAgent: new http.Agent({})
    })
  }

  async get (url: string, options?: any): Promise<any> {
    /* eslint-disable @typescript-eslint/no-unsafe-argument */
    return (await this.axios.get(url, options)).data
    /* eslint-enable @typescript-eslint/no-unsafe-argument */
  }

  async post (url: string, body: any): Promise<any> {
    return (await this.axios.post(url, body)).data
  }

  async put (url: string, body: string): Promise<any> {
    return (await this.axios.put(url, body)).data
  }

  async delete (url: string): Promise<any> {
    return (await this.axios.delete(url)).data
  }
}
