import { products } from "@/lib/data/mock";
import type { SearchProductsInput, SearchProductsResult } from "@/types/procurement";
import type { Product } from "@/types/procurement";

function resolutionArea(resolution: string): number | null {
  const match = /^(\d+)x(\d+)$/.exec(resolution);
  return match ? Number(match[1]) * Number(match[2]) : null;
}

export function searchProducts(input: SearchProductsInput = {}): SearchProductsResult {
  if (input.maxPrice !== undefined && input.maxPrice < 0) {
    return {
      success: false,
      error: { code: "INVALID_INPUT", message: "maxPrice must be zero or greater." },
    };
  }

  if (input.minSizeInches !== undefined && input.minSizeInches <= 0) {
    return {
      success: false,
      error: { code: "INVALID_INPUT", message: "minSizeInches must be greater than zero." },
    };
  }

  const minimumResolution = input.minResolution
    ? resolutionArea(input.minResolution)
    : null;

  if (input.minResolution && minimumResolution === null) {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "minResolution must use WIDTHxHEIGHT format, for example 2560x1440.",
      },
    };
  }

  const matches = products.filter((product) => {
    const productResolution = product.specs.resolution
      ? resolutionArea(product.specs.resolution)
      : null;

    return (
      (input.category === undefined || product.category === input.category) &&
      (input.maxPrice === undefined || product.price <= input.maxPrice) &&
      (input.minSizeInches === undefined ||
        (product.specs.sizeInches !== undefined &&
          product.specs.sizeInches >= input.minSizeInches)) &&
      (minimumResolution === null ||
        (productResolution !== null && productResolution >= minimumResolution)) &&
      (input.usbC === undefined || product.specs.usbC === input.usbC)
    );
  });

  return { success: true, products: matches, count: matches.length };
}

export function getProductsByIds(productIds: string[]): Product[] {
  const requestedIds = new Set(productIds);
  return products.filter((product) => requestedIds.has(product.id));
}
