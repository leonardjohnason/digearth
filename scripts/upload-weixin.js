#!/usr/bin/env node
const ci = require('miniprogram-ci')
const ciConfig = require('miniprogram-ci/dist/config/config')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const appid = process.env.WEIXIN_APPID
const privateKeyPath = process.env.WEIXIN_PRIVATE_KEY_PATH || path.join(root, 'miniprogram', 'private.upload.key')
const version = process.env.WEIXIN_UPLOAD_VERSION || require('../package.json').version || '0.1.0'
const desc = process.env.WEIXIN_UPLOAD_DESC || `Treasure Raiders release ${version}`
const robot = Number(process.env.WEIXIN_ROBOT || '1')

async function main() {
  if (!appid || appid === 'touristappid') {
    throw new Error('Missing WEIXIN_APPID. Set it to the real Mini Program AppID from Weixin MP admin.')
  }

  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`Missing Weixin upload private key: ${privateKeyPath}`)
  }

  // miniprogram-ci 2.1.31 compares project type to COMPILE_TYPE.miniGame, but
  // this build exposes only uppercase enum keys at runtime. Patch the aliases so
  // miniProgram uploads are not misclassified as miniGame uploads by Weixin.
  ciConfig.COMPILE_TYPE.miniProgram = ciConfig.COMPILE_TYPE.miniProgram || 'miniProgram'
  ciConfig.COMPILE_TYPE.miniProgramPlugin = ciConfig.COMPILE_TYPE.miniProgramPlugin || 'miniProgramPlugin'
  ciConfig.COMPILE_TYPE.miniGame = ciConfig.COMPILE_TYPE.miniGame || 'miniGame'
  ciConfig.COMPILE_TYPE.miniGamePlugin = ciConfig.COMPILE_TYPE.miniGamePlugin || 'miniGamePlugin'

  const project = new ci.Project({
    appid,
    type: process.env.WEIXIN_PROJECT_TYPE || 'miniGame',
    projectPath: path.join(root, 'miniprogram'),
    privateKeyPath,
    ignores: [
      'node_modules/**/*',
      'app.js',
      'app.json',
      'app.wxss',
      'sitemap.json',
      'pages/**/*',
      'utils/**/*'
    ],
    attr: async () => ({ ...ci.DefaultProjectAttr, appType: 0 })
  })

  await ci.upload({
    project,
    version,
    desc,
    robot,
    setting: {
      es6: true,
      es7: true,
      minify: true,
      minifyJS: true,
      minifyWXML: true,
      minifyWXSS: true,
      autoPrefixWXSS: true
    },
    onProgressUpdate: console.log
  })
}

main().catch(err => {
  console.error(err && (err.stack || err.message) || err)
  process.exit(1)
})
