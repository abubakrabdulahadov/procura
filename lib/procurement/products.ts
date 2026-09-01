import { products } from "@/lib/data/mock";
import type { SearchProductsInput, SearchProductsResult } from "@/types/procurement";

function resolutionArea(resolution: string): number | null {
  const match = /^(\d+)x(\d+)$/.exec(resolution);
  return match ? Number(match[1]) * Number(match[2]) : null;
}

/**
 * Single search implementation shared by the catalog UI and the agent's
 * search_products tool, so both operate on identical filter semantics.
 */
export function searchProducts(input: SearchProductsInput = {}): SearchProductsResult {
  if (input.maxPrice !== undefined && input.maxPrice < 0) {
    return {
      success: false,
      error: { code: "INVALID_INPUT", message: "maxPrice must be zero or greater." },
    };
  }

  if (input.minPrice !== undefined && input.minPrice < 0) {
    return {
      success: false,
      error: { code: "INVALID_INPUT", message: "minPrice must be zero or greater." },
    };
  }

  if (
    input.minPrice !== undefined &&
    input.maxPrice !== undefined &&
    input.minPrice > input.maxPrice
  ) {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: `minPrice (${input.minPrice}) cannot be greater than maxPrice (${input.maxPrice}).`,
      },
    };
  }

  if (input.minSizeInches !== undefined && input.minSizeInches <= 0) {
    return {
      success: false,
      error: { code: "INVALID_INPUT", message: "minSizeInches must be greater than zero." },
    };
  }

  const minimumResolution = input.minResolution ? resolutionArea(input.minResolution) : null;

  if (input.minResolution && minimumResolution === null) {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "minResolution must use WIDTHxHEIGHT format, for example 2560x1440.",
      },
    };
  }

  const term = input.query?.trim().toLowerCase();

  const matches = products.filter((product) => {
    const productResolution = product.specs.resolution
      ? resolutionArea(product.specs.resolution)
      : null;

    return (
      (!term || `${product.brand} ${product.name}`.toLowerCase().includes(term)) &&
      (input.category === undefined || product.category === input.category) &&
      (input.minPrice === undefined || product.price >= input.minPrice) &&
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
