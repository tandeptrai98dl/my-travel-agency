import { expect, test } from "./support/test";

// Phase 3 spec step 19: sitemap.xml split by type, robots.txt. Seed (supabase/seed.sql): VN-HLB-03
// published in VI and EN, VN-PQC-04 a draft, JP-KYT-07 published in Vietnamese only, and a
// scheduled article (published_at tomorrow).

test("sitemap.xml lists one sitemap per type", async ({ request }) => {
  const index = await request.get("/sitemap.xml");
  expect(index.status()).toBe(200);
  expect(index.headers()["content-type"]).toContain("xml");
  const body = await index.text();
  for (const type of ["pages", "tours", "destinations", "travel-styles", "journal"]) expect(body).toContain(`/sitemaps/${type}.xml</loc>`);
  expect((await request.get("/sitemaps/admin.xml")).status()).toBe(404);
});

test("the sitemaps list published pages in each language only", async ({ request }) => {
  const tours = await (await request.get("/sitemaps/tours.xml")).text();
  expect(tours).toMatch(/<loc>[^<]*\/tours\/du-thuyen-vinh-ha-long<\/loc><lastmod>[\dT:.-]+Z<\/lastmod>/);
  expect(tours).toContain("/en/tours/ha-long-bay-cruise</loc>");
  expect(tours).toContain("/tours/kyoto-tokyo-mua-thu</loc>");
  expect(tours).not.toContain("kyoto-tokyo-autumn");
  expect(tours).not.toContain("nghi-duong-phu-quoc");

  const destinations = await (await request.get("/sitemaps/destinations.xml")).text();
  expect(destinations).toContain("/diem-den/viet-nam</loc>");
  expect(destinations).toContain("/en/destinations/vietnam</loc>");

  const journal = await (await request.get("/sitemaps/journal.xml")).text();
  expect(journal).toMatch(/<loc>[^<]*\/journal<\/loc>/);
  expect(journal).not.toContain("mua-nuoc-do-mu-cang-chai");

  const pages = await (await request.get("/sitemaps/pages.xml")).text();
  for (const path of ["/lien-he", "/en/contact", "/diem-den", "/en/destinations", "/danh-gia"]) expect(pages).toContain(`${path}</loc>`);
});

test("robots.txt keeps private, transactional and filtered pages out and names the sitemap", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  for (const line of ["Disallow: /admin", "Disallow: /tai-khoan", "Disallow: /thanh-toan/", "Disallow: /en/checkout/", "Disallow: /tim-kiem", "Disallow: /tours?", "Allow: /tours?page="]) {
    expect(body).toContain(line);
  }
  expect(body).toMatch(/Sitemap: \S+\/sitemap\.xml/);
});
