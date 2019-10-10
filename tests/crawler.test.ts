import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Crawler } from "../src/crawler/index.js";

function makeHtml(links, extraContent) {
  if (extraContent === undefined) extraContent = "";
  var anchors = links.map(function(href) {
    return "<a href=" + JSON.stringify(href) + ">link</a>";
  }).join(" ");
  return "<!DOCTYPE html><html><head><title>T</title></head><body>" + anchors + extraContent + "</body></html>";
}

function mockFetch(pages) {
  return vi.fn(async function(url) {
    var href = typeof url === "string" ? url : url.href;
    var norm = href.split("#")[0];
    var page = pages[norm];
    if (!page) return { ok:false, status:404, redirected:false, url:norm, text:async()=>"404", headers:{forEach:()=>{}} };
    return { ok:true, status:page.status||200, redirected:false, url:norm,
      text:async()=>page.html,
      headers:{ forEach:function(cb){ cb(page.contentType||"text/html","content-type"); } } };
  });
}

// --- extractInternalLinks ---
describe("Crawler.extractInternalLinks", function() {
  var crawler = new Crawler({ url: "https://example.com" });
  it("extracts same-origin absolute links", function() {
    var html = makeHtml(["https://example.com/about","https://example.com/blog"]);
    var links = crawler.extractInternalLinks(html, "https://example.com/");
    expect(links).toContain("https://example.com/about");
    expect(links).toContain("https://example.com/blog");
  });
  it("resolves relative links against baseUrl", function() {
    var html = makeHtml(["/contact","services/web"]);
    var links = crawler.extractInternalLinks(html, "https://example.com/");
    expect(links).toContain("https://example.com/contact");
    expect(links).toContain("https://example.com/services/web");
  });
  it("excludes cross-origin links", function() {
    var html = makeHtml(["https://other.com/page","https://example.com/local"]);
    var links = crawler.extractInternalLinks(html, "https://example.com/");
    expect(links).not.toContain("https://other.com/page");
    expect(links).toContain("https://example.com/local");
  });
  it("excludes fragment-only anchors", function() {
    var links = crawler.extractInternalLinks(makeHtml(["#s"]), "https://example.com/");
    expect(links.length).toBe(0);
  });
  it("strips fragments from links that have them", function() {
    var links = crawler.extractInternalLinks(makeHtml(["https://example.com/page#s"]), "https://example.com/");
    expect(links).toContain("https://example.com/page");
    expect(links.some(function(l){ return l.includes("#"); })).toBe(false);
  });
  it("deduplicates links", function() {
    var links = crawler.extractInternalLinks(makeHtml(["https://example.com/about","https://example.com/about","/about"]), "https://example.com/");
    expect(links.filter(function(l){ return l==="https://example.com/about"; }).length).toBe(1);
  });
  it("excludes mailto tel and javascript links", function() {
    var links = crawler.extractInternalLinks(makeHtml(["mailto:x@e.com","tel:+1","javascript:void(0)"]), "https://example.com/");
    expect(links.length).toBe(0);
  });
  it("returns empty array when no links present", function() {
    expect(crawler.extractInternalLinks("<html><body></body></html>","https://example.com/")).toEqual([]);
  });
});

// --- depth limiting ---
describe("Crawler.crawl - depth limiting", function() {
  var orig;
  beforeEach(function(){ orig = globalThis.fetch; });
  afterEach(function(){ globalThis.fetch = orig; vi.restoreAllMocks(); });
  it("only fetches the start URL when maxDepth=0", async function() {
    var pages = {
      "https://example.com/": { html: makeHtml(["https://example.com/about","https://example.com/blog"]) },
      "https://example.com/about": { html: makeHtml([]) },
      "https://example.com/blog": { html: makeHtml([]) }
    };
    globalThis.fetch = mockFetch(pages);
    var r = await new Crawler({ url: "https://example.com/", maxDepth: 0 }).crawl();
    expect(r.length).toBe(1);
    expect(r[0].url).toBe("https://example.com/");
  });
  it("follows links one level deep when maxDepth=1", async function() {
    var pages = {
      "https://example.com/": { html: makeHtml(["https://example.com/about","https://example.com/blog"]) },
      "https://example.com/about": { html: makeHtml(["https://example.com/team"]) },
      "https://example.com/blog": { html: makeHtml([]) },
      "https://example.com/team": { html: makeHtml([]) }
    };
    globalThis.fetch = mockFetch(pages);
    var r = await new Crawler({ url: "https://example.com/", maxDepth: 1 }).crawl();
    var urls = r.map(function(p){ return p.url; });
    expect(urls).toContain("https://example.com/");
    expect(urls).toContain("https://example.com/about");
    expect(urls).toContain("https://example.com/blog");
    expect(urls).not.toContain("https://example.com/team");
  });
  it("follows links two levels deep when maxDepth=2", async function() {
    var pages = {
      "https://example.com/": { html: makeHtml(["https://example.com/about"]) },
      "https://example.com/about": { html: makeHtml(["https://example.com/team"]) },
      "https://example.com/team": { html: makeHtml(["https://example.com/person"]) },
      "https://example.com/person": { html: makeHtml([]) }
    };
    globalThis.fetch = mockFetch(pages);
    var r = await new Crawler({ url: "https://example.com/", maxDepth: 2 }).crawl();
    var urls = r.map(function(p){ return p.url; });
    expect(urls).toContain("https://example.com/");
    expect(urls).toContain("https://example.com/about");
    expect(urls).toContain("https://example.com/team");
    expect(urls).not.toContain("https://example.com/person");
  });
});

// --- cycle detection ---
describe("Crawler.crawl - cycle detection", function() {
  var orig;
  beforeEach(function(){ orig = globalThis.fetch; });
  afterEach(function(){ globalThis.fetch = orig; vi.restoreAllMocks(); });
  it("does not revisit already-visited URLs", async function() {
    var pages = {
      "https://example.com/": { html: makeHtml(["https://example.com/b"]) },
      "https://example.com/b": { html: makeHtml(["https://example.com/"]) }
    };
    var spy = mockFetch(pages);
    globalThis.fetch = spy;
    var r = await new Crawler({ url: "https://example.com/", maxDepth: 5 }).crawl();
    var urls = r.map(function(p){ return p.url; });
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.length).toBe(2);
    expect(spy.mock.calls.filter(function(a){ return a[0].split("#")[0]==="https://example.com/"; }).length).toBe(1);
  });
  it("treats URLs differing only by fragment as the same page", async function() {
    var pages = { "https://example.com/": { html: makeHtml(["https://example.com/#h","https://example.com/#f"]) } };
    globalThis.fetch = mockFetch(pages);
    var r = await new Crawler({ url: "https://example.com/", maxDepth: 1 }).crawl();
    expect(r.length).toBe(1);
  });
});

// --- maxPages limit ---
describe("Crawler.crawl - maxPages limit", function() {
  var orig;
  beforeEach(function(){ orig = globalThis.fetch; });
  afterEach(function(){ globalThis.fetch = orig; vi.restoreAllMocks(); });
  it("stops crawling after maxPages pages", async function() {
    var ll = [];
    for (var i=1;i<=9;i++) ll.push("https://example.com/p"+i);
    var pages = { "https://example.com/": { html: makeHtml(ll) } };
    for (var j=1;j<=9;j++) pages["https://example.com/p"+j] = { html: makeHtml([]) };
    globalThis.fetch = mockFetch(pages);
    var r = await new Crawler({ url: "https://example.com/", maxDepth: 1, maxPages: 3 }).crawl();
    expect(r.length).toBeLessThanOrEqual(3);
  });
  it("returns all pages when total pages are fewer than maxPages", async function() {
    var pages = {
      "https://example.com/": { html: makeHtml(["https://example.com/a","https://example.com/b"]) },
      "https://example.com/a": { html: makeHtml([]) },
      "https://example.com/b": { html: makeHtml([]) }
    };
    globalThis.fetch = mockFetch(pages);
    var r = await new Crawler({ url: "https://example.com/", maxDepth: 1, maxPages: 100 }).crawl();
    expect(r.length).toBe(3);
  });
});

// --- content-type filtering ---
describe("Crawler.crawl - content-type filtering", function() {
  var orig;
  beforeEach(function(){ orig = globalThis.fetch; });
  afterEach(function(){ globalThis.fetch = orig; vi.restoreAllMocks(); });
  it("skips non-HTML pages", async function() {
    var pages = {
      "https://example.com/": { html: makeHtml(["https://example.com/style.css","https://example.com/about"]) },
      "https://example.com/style.css": { html: "body{color:red}", contentType: "text/css" },
      "https://example.com/about": { html: makeHtml([]) }
    };
    globalThis.fetch = mockFetch(pages);
    var r = await new Crawler({ url: "https://example.com/", maxDepth: 1 }).crawl();
    var urls = r.map(function(p){ return p.url; });
    expect(urls).not.toContain("https://example.com/style.css");
    expect(urls).toContain("https://example.com/about");
  });
});
