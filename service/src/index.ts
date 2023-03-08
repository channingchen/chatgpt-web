import express from 'express'
import sqlite from 'sqlite-sync'
import CryptoJS from 'crypto-js'
import type { ChatContext, ChatMessage } from './chatgpt'
import { chatConfig, chatReplyProcess } from './chatgpt'

const key = CryptoJS.enc.Utf8.parse('8ICpNF7R4dmfhJcS')

const db = sqlite.connect('./db/database.db')

const app = express()
const router = express.Router()

app.use(express.static('public'))
app.use(express.json())

app.all('*', (_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  next()
})

function decrypt(word: string) {
  // const encryptedHexStr = CryptoJS.enc.Hex.parse(word)
  // const srcs = CryptoJS.enc.Base64.stringify(encryptedHexStr)
  const decrypt = CryptoJS.AES.decrypt(word, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 })
  const decryptedStr = decrypt.toString(CryptoJS.enc.Utf8)
  return decryptedStr.toString()
}

function checkToken(word: string) {
  const plainToken = decrypt(word)
  if (!plainToken || !plainToken.startsWith('CG'))
    return false
  const parts = plainToken.split('_')
  if (parts.length !== 3)
    return false
  const seconds = Number(parts[1])
  let date = new Date()
  date = new Date(date.setTime(date.getTime() - seconds * 1000))
  let result = false
  db.run(`select * from token_table where token = '${plainToken}'`,
    (rows) => {
      if (rows.length > 0) {
        const start = rows[0].start
        const compare = date.getTime()
        if (start > compare)
          result = true
      }
      else {
        db.run(`insert into token_table values('${plainToken}', ${Date.now()})`)
        result = true
      }
    })

  return result
}

router.post('/chat-process', async (req, res) => {
  res.setHeader('Content-type', 'application/octet-stream')

  try {
    const { prompt, token, options = {} } = req.body as { prompt: string; token: string; options?: ChatContext }
    if (!checkToken(token)) {
      res.write(JSON.stringify({ message: 'token已过期' }))
      return
    }

    let firstChunk = true
    await chatReplyProcess(prompt, options, (chat: ChatMessage) => {
      res.write(firstChunk ? JSON.stringify(chat) : `\n${JSON.stringify(chat)}`)
      firstChunk = false
    })
  }
  catch (error) {
    res.write(JSON.stringify(error))
  }
  finally {
    res.end()
  }
})

router.post('/config', async (req, res) => {
  try {
    const response = await chatConfig()
    res.send(response)
  }
  catch (error) {
    res.send(error)
  }
})

router.post('/session', async (req, res) => {
  try {
    const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY
    const hasAuth = typeof AUTH_SECRET_KEY === 'string' && AUTH_SECRET_KEY.length > 0
    res.send({ status: 'Success', message: '', data: { auth: hasAuth } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body as { token: string }
    if (!token)
      throw new Error('Secret key is empty')

    if (process.env.AUTH_SECRET_KEY !== token)
      throw new Error('密钥无效 | Secret key is invalid')

    res.send({ status: 'Success', message: 'Verify successfully', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

app.use('', router)
app.use('/api', router)

app.listen(3002, () => globalThis.console.log('Server is running on port 3002'))
