const fs = require('fs');
const axios = require('axios');
const { ethers } = require('ethers');
const randomUseragent = require('random-useragent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const puppeteer = require('puppeteer');

const BASE_API = 'https://api1-pp.klokapp.ai/v1';
const PAGE_URL = 'https://klokapp.ai';
const SITE_KEY = '0x4AAAAAABdQypM3HkDQTuaO';
const REF_CODE = 'GGQ3GJ46';

class KlokApp {
  constructor() {
    this.turnstileTokens = new Map();
    this.sessionTokens = new Map();
    this.browserIds = new Map();
    this.proxies = [];
    this.proxyIndex = 0;
    this.accountProxies = new Map();
    this.captchaKey = null;
  }

  log(msg) {
    const time = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' });
    console.log(`[ ${time} ] | ${msg}`);
  }

  load2CaptchaKey() {
    try {
      const key = fs.readFileSync('2captcha_key.txt', 'utf8').trim();
      if (key) this.captchaKey = key;
    } catch (e) {
      this.log('2captcha_key.txt not found');
    }
  }

  async loadProxies(choice) {
    const filename = 'proxy.txt';
    try {
      if (choice === 1) {
        const { data } = await axios.get('https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/all.txt');
        fs.writeFileSync(filename, data);
        this.proxies = data.split(/\r?\n/).filter(Boolean);
      } else {
        if (!fs.existsSync(filename)) throw new Error('proxy.txt not found');
        this.proxies = fs.readFileSync(filename, 'utf8').split(/\r?\n/).filter(Boolean);
      }
      this.log(`Proxies Total: ${this.proxies.length}`);
    } catch (e) {
      this.log(`Failed to load proxies: ${e.message}`);
      this.proxies = [];
    }
  }

  checkScheme(proxy) {
    if (!proxy) return null;
    const schemes = ['http://', 'https://', 'socks4://', 'socks5://'];
    return schemes.some(s => proxy.startsWith(s)) ? proxy : `http://${proxy}`;
  }

  nextProxy(address) {
    if (!this.proxies.length) return null;
    if (!this.accountProxies.has(address)) {
      const proxy = this.checkScheme(this.proxies[this.proxyIndex]);
      this.accountProxies.set(address, proxy);
      this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
    }
    return this.accountProxies.get(address);
  }

  rotateProxy(address) {
    if (!this.proxies.length) return null;
    const proxy = this.checkScheme(this.proxies[this.proxyIndex]);
    this.accountProxies.set(address, proxy);
    this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
    return proxy;
  }

  generateAddress(pk) {
    try {
      const wallet = new ethers.Wallet(pk);
      return wallet.address;
    } catch (e) {
      this.log(`Invalid private key: ${e.message}`);
      return null;
    }
  }

  generatePayload(pk, address) {
    try {
      const wallet = new ethers.Wallet(pk);
      const nonce = ethers.hexlify(ethers.randomBytes(24));
      const issuedAt = new Date().toISOString().replace('+00:00', 'Z');
      const message = `klokapp.ai wants you to sign in with your Ethereum account:\n${address}\n\n\nURI: https://klokapp.ai/\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
      const signature = wallet.signMessageSync(message);
      return { signedMessage: signature, message, referral_code: REF_CODE };
    } catch (e) {
      return null;
    }
  }

  generateBrowserId() {
    return crypto.randomUUID();
  }

  contentList() {
    return [
      'Help me brainstorm startup ideas',
      'Teach me about a topic in depth',
      'Plan a vacation itinerary for me',
      'Tell me a fun fact about fishes',
      'Give me tips to stay focused while studying',
      'Explain quantum physics in simple terms',
      'Write a short story about a time-traveling cat',
      'Suggest a healthy dinner recipe',
      "What's a good book to read this month?",
      "Translate 'I love programming' to Japanese",
      'What are the benefits of meditation?',
      'Summarize the plot of Harry Potter',
      'How do I start a podcast?',
      'Create a workout plan for beginners',
      'Tell me a joke to make my day',
      'What are some fun indoor activities for kids?',
      'Help me write a professional email',
      "What's the capital of Iceland?",
      'Suggest weekend activities for couples',
      "What's the difference between AI and machine learning?",
      'Help me improve my resume',
      'Give me ideas for a birthday party',
      "Explain blockchain like I'm five",
      "What's trending in tech right now?",
      'How do I bake a chocolate cake?',
      "Tell me a historical fact I didn't know",
      'How can I save more money each month?',
      'What are the symptoms of burnout?',
      'Teach me how to play chess',
      'What is a good movie to watch tonight?',
      'Write a poem about the ocean',
      'How can I learn to code fast?',
      'What is the meaning of life?',
      'Give me a quote to inspire me today',
      'Tell me how rainbows form',
      'What is the best way to learn a new language?',
      'Suggest a name for my new puppy',
      'Tell me a riddle to solve',
      'What are some common interview questions?',
      'Give me a recipe for homemade pizza',
      'What is the largest animal in the world?',
      'How do I create a budget?',
      'Describe a futuristic city',
      'Give me ideas for YouTube content',
      "What's the best time to visit Japan?",
      'How do I stay motivated to work out?',
      'Write a haiku about spring',
      'What are the top tourist spots in Paris?',
      'How do plants make food?',
      'What are the rules of football?'
    ];
  }

  async checkConnection(proxy) {
    let browser;
    try {
      const opts = { headless: 'new' };
      if (proxy) opts.args = [`--proxy-server=${proxy}`];
      browser = await puppeteer.launch(opts);
      const page = await browser.newPage();
      await page.goto(PAGE_URL, { timeout: 30000 });
      await browser.close();
      return true;
    } catch (e) {
      if (browser) await browser.close();
      return false;
    }
  }

  async solveTurnstile(address, proxy) {
    if (!this.captchaKey) return false;
    const agent = proxy ? (proxy.startsWith('socks') ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy)) : undefined;
    try {
      const { data } = await axios.get(`http://2captcha.com/in.php?key=${this.captchaKey}&method=turnstile&sitekey=${SITE_KEY}&pageurl=${PAGE_URL}`, { httpAgent: agent, httpsAgent: agent });
      if (!data.startsWith('OK|')) return false;
      const reqId = data.split('|')[1];
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const res = await axios.get(`http://2captcha.com/res.php?key=${this.captchaKey}&action=get&id=${reqId}`, { httpAgent: agent, httpsAgent: agent });
        if (res.data.startsWith('OK|')) {
          this.turnstileTokens.set(address, res.data.split('|')[1]);
          return true;
        }
        if (res.data !== 'CAPCHA_NOT_READY') break;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  async userLogin(pk, address, proxy) {
    const payload = this.generatePayload(pk, address);
    if (!payload) return null;
    const token = this.turnstileTokens.get(address);
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': randomUseragent.getRandom(),
      'X-Turnstile-Token': token
    };
    const agent = proxy ? (proxy.startsWith('socks') ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy)) : undefined;
    try {
      const res = await axios.post(`${BASE_API}/verify`, payload, { headers, httpAgent: agent, httpsAgent: agent, timeout: 60000 });
      this.sessionTokens.set(address, res.data.session_token);
      this.browserIds.set(address, crypto.randomUUID());
      return true;
    } catch (e) {
      return false;
    }
  }

  async userPoints(address, proxy) {
    const token = this.sessionTokens.get(address);
    const headers = { 'X-Session-Token': token, 'User-Agent': randomUseragent.getRandom() };
    const agent = proxy ? (proxy.startsWith('socks') ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy)) : undefined;
    try {
      const res = await axios.get(`${BASE_API}/points`, { headers, httpAgent: agent, httpsAgent: agent, timeout: 60000 });
      return res.data.total_points || 0;
    } catch (e) {
      return 'N/A';
    }
  }

  async rateLimit(address, proxy) {
    const token = this.sessionTokens.get(address);
    const headers = { 'X-Session-Token': token, 'User-Agent': randomUseragent.getRandom() };
    const agent = proxy ? (proxy.startsWith('socks') ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy)) : undefined;
    try {
      const res = await axios.get(`${BASE_API}/rate-limit`, { headers, httpAgent: agent, httpsAgent: agent, timeout: 60000 });
      return res.data.remaining || 0;
    } catch (e) {
      return 0;
    }
  }

  async performChat(address, content, proxy) {
    const token = this.sessionTokens.get(address);
    const turnstile = this.turnstileTokens.get(address);
    const payload = {
      id: this.browserIds.get(address),
      title: '',
      messages: [{ role: 'user', content }],
      sources: [],
      model: 'llama-3.3-70b-instruct',
      created_at: new Date().toISOString().replace('+00:00', 'Z'),
      language: 'english',
      search: false
    };
    const headers = {
      'Content-Type': 'application/json',
      'X-Session-Token': token,
      'X-Turnstile-Token': turnstile,
      'User-Agent': randomUseragent.getRandom()
    };
    const agent = proxy ? (proxy.startsWith('socks') ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy)) : undefined;
    try {
      const res = await axios.post(`${BASE_API}/chat`, payload, { headers, httpAgent: agent, httpsAgent: agent, timeout: 60000 });
      return res.data;
    } catch (e) {
      return null;
    }
  }

  mask(addr) {
    return addr.slice(0, 6) + '******' + addr.slice(-6);
  }

  async processAccount(pk, useProxy, rotateProxy) {
    const address = this.generateAddress(pk);
    if (!address) return;
    let proxy = useProxy ? this.nextProxy(address) : null;
    const connected = await this.checkConnection(proxy);
    if (!connected && rotateProxy) {
      proxy = this.rotateProxy(address);
      if (!(await this.checkConnection(proxy))) {
        this.log('Proxy failed to connect');
        return;
      }
    } else if (!connected) {
      this.log('Connection failed');
      return;
    }
    this.log(`Account ${this.mask(address)} connected`);
    const solved = await this.solveTurnstile(address, proxy);
    if (!solved) {
      this.log('Solve captcha failed');
      return;
    }
    const login = await this.userLogin(pk, address, proxy);
    if (!login) {
      this.log('Login failed');
      return;
    }
    const points = await this.userPoints(address, proxy);
    this.log(`Points: ${points}`);
    const remaining = await this.rateLimit(address, proxy);
    if (remaining > 0) {
      const contents = this.contentList();
      for (let i = 0; i < remaining; i++) {
        const text = contents[Math.floor(Math.random()*contents.length)];
        this.log(`Question: ${text}`);
        const ans = await this.performChat(address, text, proxy);
        this.log(`Answer: ${ans}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

(async () => {
  const bot = new KlokApp();
  bot.load2CaptchaKey();
  const accounts = fs.readFileSync('accounts.txt', 'utf8').split(/\r?\n/).filter(Boolean);
  const useProxyChoice = 3; // modify as needed
  const rotate = false;
  if (useProxyChoice === 1 || useProxyChoice === 2) {
    await bot.loadProxies(useProxyChoice);
  }
  for (const acc of accounts) {
    await bot.processAccount(acc, useProxyChoice !== 3, rotate);
  }
})();
