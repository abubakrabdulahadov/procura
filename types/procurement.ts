export type ProductCategory =
  "monitor" | "laptop" | "accessory" | "office" | "furniture" | "facilities";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  brand: string;
  price: number;
  specs: {
    sizeInches?: number;
    resolution?: string;
    usbC?: boolean;
    refreshRateHz?: number;
    ramGb?: number;
    storageGb?: number;
    batteryHours?: number;
    connection?: string;
    material?: string;
    packSize?: number;
  };
}

export interface SearchProductsInput {
  category?: ProductCategory;
  maxPrice?: number;
  minSizeInches?: number;
  minResolution?: string;
  usbC?: boolean;
}

export type SearchProductsResult =
  | { success: true; products: Product[]; count: number }
  | {
      success: false;
      error: { code: "INVALID_INPUT"; message: string };
    };

export interface ProductIntelligence {
  description: string;
  rating: number;
  reviewCount: number;
  purchasedCount: number;
}

export interface ProductReview {
  id: string;
  productId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  author: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface ProductAvailability {
  productId: string;
  availableQuantity: number;
  unlimited?: boolean;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  deliveryLabel: string;
}

export interface InstallmentPlan {
  months: 3 | 6 | 12 | 24;
  monthlyPayment: number;
  fee: number;
  totalPayable: number;
}

export type ProductDetailResult =
  | { success: true; product: Product & ProductIntelligence }
  | { success: false; error: { code: "PRODUCT_NOT_FOUND"; message: string } };

export type ProductReviewsResult =
  | {
      success: true;
      productId: string;
      rating: number;
      reviewCount: number;
      returnedCount: number;
      reviews: ProductReview[];
    }
  | { success: false; error: { code: "PRODUCT_NOT_FOUND" | "INVALID_INPUT"; message: string } };

export type ProductAvailabilityResult =
  | {
      success: true;
      availability: ProductAvailability;
      requestedQuantity: number;
      canFulfill: true;
    }
  | {
      success: false;
      error: {
        code: "PRODUCT_NOT_FOUND" | "INVALID_QUANTITY" | "INSUFFICIENT_STOCK";
        message: string;
        availableQuantity?: number;
        requestedQuantity?: number;
      };
    };

export type InstallmentOptionsResult =
  | {
      success: true;
      productId: string;
      eligible: boolean;
      unitPrice: number;
      quantity: number;
      total: number;
      plans: InstallmentPlan[];
    }
  | { success: false; error: { code: "PRODUCT_NOT_FOUND" | "INVALID_QUANTITY"; message: string } };

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  updatedAt: string;
}

export type CartResult = { success: true; cart: Cart };
export type CartMutationResult =
  | { success: true; cart: Cart; message: string }
  | {
      success: false;
      error: {
        code: "PRODUCT_NOT_FOUND" | "INVALID_QUANTITY" | "ITEM_NOT_IN_CART" | "INSUFFICIENT_STOCK";
        message: string;
        availableQuantity?: number;
        requestedQuantity?: number;
      };
    };

export type OrderProposalStatus =
  "pending_human_approval" | "approved" | "rejected" | "changes_requested";

export interface OrderProposal {
  id: string;
  cart: Cart;
  subtotal: number;
  installmentMonths?: 3 | 6 | 12 | 24;
  paymentFee: number;
  total: number;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  status: OrderProposalStatus;
  approvalToken?: string;
  createdAt: string;
}

export type PrepareOrderResult =
  | { success: true; proposal: OrderProposal; message: string }
  | {
      success: false;
      error: {
        code: "EMPTY_CART" | "INVALID_CART" | "INVALID_INSTALLMENT_TERM" | "INSUFFICIENT_STOCK";
        message: string;
      };
    };

export type OrderProposalDecision = "approve" | "reject" | "request_changes";

export interface Order {
  id: string;
  proposalId: string;
  items: CartItem[];
  subtotal: number;
  installmentMonths?: 3 | 6 | 12 | 24;
  paymentFee: number;
  total: number;
  status: "placed";
  createdAt: string;
}

export type PlaceOrderResult =
  | { success: true; order: Order; message: string }
  | {
      success: false;
      error: {
        code:
          | "PROPOSAL_NOT_FOUND"
          | "APPROVAL_REQUIRED"
          | "CART_CHANGED_AFTER_APPROVAL"
          | "ORDER_ALREADY_PLACED"
          | "INSUFFICIENT_STOCK";
        message: string;
        orderId?: string;
      };
    };

export type GetOrderResult =
  | { success: true; order: Order }
  | { success: false; error: { code: "ORDER_NOT_FOUND"; message: string } };
