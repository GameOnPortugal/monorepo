import { type HttpClient } from '../../Domain/Http/HttpClient'
import { inject, injectable } from 'inversify'
import AxiosHttpClient from './AxiosHttpClient'
import { sleep } from '../../Application/Shared/sleep'
import { TYPES } from '../DependencyInjection/types'
import Logger from '../../Application/Logger/Logger'

@injectable()
export default class RetryAxiosHttpClient implements HttpClient {
  constructor (
    @inject(AxiosHttpClient) private readonly axios: AxiosHttpClient,
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {
  }

  async get (url: string, options?: any, attempt: number = 1): Promise<any> {
    try {
      return await this.axios.get(url, options)
    } catch (error: any) {
      const sleepMs = attempt ** 2 * 1000
      this.logger.error(`Retrying ${attempt}, url: ${url}, sleep: ${sleepMs}`, {
        error_message: error.message,
        error,
        url,
        attempt,
        sleepMs
      })
      if (attempt >= (options?.max_attempts ?? 5)) {
        throw error
      }

      await sleep(sleepMs)
      return await this.get(url, options, attempt + 1)
    }
  }

  async post (url: string, body: any, attempt: number = 1): Promise<any> {
    try {
      return await this.axios.post(url, body)
    } catch (error: any) {
      this.logger.error('Failed to post', {
        error_message: error.message,
        error,
        url,
        attempt
      })
      if (attempt >= 5) {
        throw error
      }
      await sleep(attempt * 1000)
      return await this.post(url, body, attempt + 1)
    }
  }

  async put (url: string, body: string, attempt: number = 1): Promise<any> {
    try {
      return await this.axios.put(url, body)
    } catch (error: any) {
      this.logger.error('Failed to put', {
        error_message: error.message,
        error,
        url,
        attempt
      })
      if (attempt >= 5) {
        throw error
      }
      await sleep(attempt * 1000)
      return await this.put(url, body, attempt + 1)
    }
  }

  async delete (url: string, attempt: number = 1): Promise<any> {
    try {
      return await this.axios.delete(url)
    } catch (error: any) {
      this.logger.error('Failed to delete', {
        error_message: error.message,
        error,
        url,
        attempt
      })
      if (attempt >= 5) {
        throw error
      }
      await sleep(attempt * 1000)
      return await this.delete(url, attempt + 1)
    }
  }
}
