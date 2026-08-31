import { products } from "@/lib/data/mock";
import type { InstallmentOptionsResult, ProductAvailabilityResult, ProductDetailResult, ProductIntelligence, ProductReview, ProductReviewsResult } from "@/types/procurement";

function findProduct(productId: string) { return products.find((product) => product.id === productId); }
function seed(productId: string) { return [...productId].reduce((total, character) => total + character.charCodeAt(0), 0); }

const reviewTemplates = [
  { rating: 5 as const, title: "Reliable for daily work", body: "Setup was straightforward and the product has been dependable in regular office use.", author: "M. Karimov" },
  { rating: 4 as const, title: "Good balance", body: "The core features match the listing and the overall value is strong for a workplace purchase.", author: "S. Lee" },
  { rating: 5 as const, title: "Would purchase again", body: "Delivery was well packed and the item has performed consistently since arrival.", author: "A. Morgan" },
  { rating: 3 as const, title: "Solid with minor tradeoffs", body: "It works as described, though the finish and setup experience could be more refined.", author: "D. Chen" },
  { rating: 4 as const, title: "Useful for our team", body: "The team adopted it quickly and it has handled normal workplace use without issues.", author: "N. Rahman" },
  { rating: 5 as const, title: "Excellent quality", body: "Materials feel durable and the product arrived exactly as specified in the catalog.", author: "J. Wilson" },
  { rating: 4 as const, title: "Matches the specification", body: "Performance and dimensions match the listed details, making purchasing straightforward.", author: "R. Patel" },
  { rating: 5 as const, title: "Strong workplace choice", body: "A dependable option that offers the right combination of quality and day-to-day usability.", author: "K. Garcia" },
  { rating: 3 as const, title: "Does the job", body: "The essential features are good, but packaging and initial setup could be improved.", author: "T. Brown" },
  { rating: 4 as const, title: "Good overall value", body: "After several weeks of use, it remains a practical purchase at this price point.", author: "L. Ahmed" },
];

function buildProductReviews(productId: string): ProductReview[] {
  const value = seed(productId);
  const count = 5 + (value % 6);
  return Array.from({ length: count }, (_, index) => {
    const template = reviewTemplates[(index + value) % reviewTemplates.length];
    return { id: `${productId}-review-${index + 1}`, productId, ...template, verifiedPurchase: (index + value) % 4 !== 1, createdAt: `2026-${String((index % 8) + 1).padStart(2, "0")}-15T10:00:00.000Z` };
  });
}

export function getProductIntelligence(productId: string): ProductIntelligence {
  const product = findProduct(productId);
  const value = seed(productId);
  const reviews = product ? buildProductReviews(productId) : [];
  const rating = reviews.length > 0 ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length : 0;
  const categoryName = product?.category === "office" ? "office supply" : product?.category || "product";
  return {
    description: `${product?.brand || "This"} ${product?.name || "item"} is a curated ${categoryName} selected for modern workplace purchasing. Compare its specifications, availability, delivery, and payment options before adding it to a cart.`,
    rating: Number(rating.toFixed(1)),
    reviewCount: reviews.length,
    purchasedCount: 90 + (value % 1900),
  };
}

export function getProduct(productId: string): ProductDetailResult {
  const product = findProduct(productId);
  return product ? { success: true, product: { ...product, ...getProductIntelligence(productId) } } : { success: false, error: { code: "PRODUCT_NOT_FOUND", message: `No catalog product exists with ID ${productId}.` } };
}

export function getProductReviews(productId: string, limit = 3): ProductReviewsResult {
  const product = findProduct(productId);
  if (!product) return { success: false, error: { code: "PRODUCT_NOT_FOUND", message: `No catalog product exists with ID ${productId}.` } };
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) return { success: false, error: { code: "INVALID_INPUT", message: "limit must be an integer between 1 and 10." } };
  const allReviews = buildProductReviews(productId);
  const reviews = allReviews.slice(0, limit);
  const rating = allReviews.reduce((total, review) => total + review.rating, 0) / allReviews.length;
  return { success: true, productId, rating: Number(rating.toFixed(1)), reviewCount: allReviews.length, returnedCount: reviews.length, reviews };
}

export function checkProductAvailability(productId: string, quantity: number): ProductAvailabilityResult {
  const product = findProduct(productId);
  if (!product) return { success: false, error: { code: "PRODUCT_NOT_FOUND", message: `No catalog product exists with ID ${productId}.` } };
  if (!Number.isInteger(quantity) || quantity < 1) return { success: false, error: { code: "INVALID_QUANTITY", message: "quantity must be a positive integer.", requestedQuantity: quantity } };
  const value = seed(productId);
  const availableQuantity = 1_000_000;
  const deliveryMinDays = 1 + (value % 3);
  const deliveryMaxDays = deliveryMinDays + 2;
  return { success: true, availability: { productId, availableQuantity, unlimited: true, deliveryMinDays, deliveryMaxDays, deliveryLabel: `${deliveryMinDays}–${deliveryMaxDays} business days` }, requestedQuantity: quantity, canFulfill: true };
}

export function getInstallmentOptions(productId: string, quantity = 1): InstallmentOptionsResult {
  const product = findProduct(productId);
  if (!product) return { success: false, error: { code: "PRODUCT_NOT_FOUND", message: `No catalog product exists with ID ${productId}.` } };
  if (!Number.isInteger(quantity) || quantity < 1) return { success: false, error: { code: "INVALID_QUANTITY", message: "quantity must be a positive integer." } };
  const total = product.price * quantity;
  const eligible = total >= 100;
  const terms = [3, 6, 12, 24] as const;
  const plans = eligible ? terms.map((months) => { const rate = months <= 6 ? 0 : months === 12 ? 0.04 : 0.09; const fee = Number((total * rate).toFixed(2)); const totalPayable = Number((total + fee).toFixed(2)); return { months, monthlyPayment: Number((totalPayable / months).toFixed(2)), fee, totalPayable }; }) : [];
  return { success: true, productId, eligible, unitPrice: product.price, quantity, total, plans };
}
