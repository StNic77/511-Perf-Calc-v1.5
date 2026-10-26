const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

// Small document model for deterministic state/render regression tests.
// Does not claim browser layout or device coverage.
module.exports = function loadApp() {
  const elements = new Map();
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.dataset = {}; this.style = {};
      this.value = ''; this.hidden = false; this._text = ''; this.handlers = {};
      this.classList = {toggle(){},add(){},remove(){},contains(){return false;}};
    }
    get firstChild() { return this.children[0] || null; }
    get textContent() { return this._text + this.children.map(c=>c.textContent).join(' '); }
    set textContent(value) { this._text = String(value); this.children = []; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child),1); }
    setAttribute(name,value) { this[name]=value; if(name==='id') elements.set(value,this); }
    addEventListener(name,handler) { this.handlers[name]=handler; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    closest() { return null; }
    focus() {}
  }
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const [,id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id,new Element());
  const document = {
    readyState:'loading', addEventListener(){}, body:new Element('body'),
    querySelector:s=>s.startsWith('#')?elements.get(s.slice(1))||null:null,
    querySelectorAll:()=>[], getElementById:id=>elements.get(id)||null,
    createElement:tag=>new Element(tag), createElementNS:(_,tag)=>new Element(tag),
    createTextNode:text=>{ const n=new Element('#text'); n.textContent=text; return n; }
  };
  const context = vm.createContext({document,console,localStorage:{getItem:()=>null,setItem(){}},
    navigator:{},setInterval(){},setTimeout(){},Date});
  for(const file of ['config.js','compute.js','app.js']) vm.runInContext(
    fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  return {root,elements,context,run:source=>vm.runInContext(source,context)};
};
