import type { Offer } from "@snagwise/core";

/*
  Development-only stand-in for Channel3, used while there is no API key so the Discover
  screen can be built and tested. These are NOT real listings: generic names, example.com
  links, no images. The UI labels them as a sample catalog.
*/

const item = (id: string, title: string, category: string, brand: string, price: number, listPrice?: number): Offer => {
  const offer: Offer = {
    productId: `sample-${id}`,
    title,
    url: `https://example.com/sample/${id}`,
    domain: "example.com",
    priceCents: price * 100,
    currency: "USD",
    category,
    brand,
  };
  if (listPrice) offer.compareAtCents = listPrice * 100;
  return offer;
};

export const SAMPLE_CATALOG: Offer[] = [
  item("1", "Over-ear wireless headphones with noise cancelling", "Headphones", "Sample Audio", 149, 199),
  item("2", "True wireless earbuds, 30 h battery", "Headphones", "Sample Audio", 59, 79),
  item("3", "Studio monitor headphones, wired", "Headphones", "Northwave", 99),
  item("4", "Trail running shoes, rock plate", "Running Shoes", "Ridgeline", 89, 130),
  item("5", "Road running shoes, max cushion", "Running Shoes", "Stride Co", 120),
  item("6", "Minimal barefoot running shoes", "Running Shoes", "Ridgeline", 75, 95),
  item("7", "Espresso machine with milk frother", "Coffee Makers", "Crema Home", 189, 249),
  item("8", "Manual burr coffee grinder", "Coffee Makers", "Crema Home", 45),
  item("9", "Pour-over coffee kit with scale", "Coffee Makers", "Bloom", 39, 55),
  item("10", "Ultralight 2-person tent", "Camping", "Basecamp", 210, 280),
  item("11", "Insulated water bottle, 1 L", "Camping", "Basecamp", 29),
  item("12", "Mechanical keyboard, hot-swappable", "Keyboards", "Keyforge", 109, 139),
  item("13", "Compact wireless keyboard and mouse set", "Keyboards", "Northwave", 49),
  item("14", "Smart LED desk lamp with USB-C", "Lamps", "Lumen", 39, 59),
  item("15", "Sunrise alarm clock lamp", "Lamps", "Lumen", 69),
  item("16", "Carry-on backpack, 35 L", "Bags", "Wayfarer", 129, 160),
  item("17", "Wireless game controller, last-gen model", "Controllers", "Pixel Forge", 44, 69),
  item("18", "Gaming headset with detachable mic", "Headsets", "Pixel Forge", 59, 89),
  item("19", "Handheld console, manufacturer refurbished", "Consoles", "Pixel Forge", 249, 329),
  item("20", "Open-world adventure game, physical edition", "Video Games", "Sample Studio", 39, 69),
];
