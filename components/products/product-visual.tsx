import Image from "next/image";
import type { Product } from "@/types/procurement";

const categoryImages: Record<Product["category"], string> = {
  monitor: "/product-images/monitor.png",
  laptop: "/product-images/laptop.png",
  accessory: "/product-images/accessory.png",
  office: "/product-images/office.png",
  furniture: "/product-images/furniture.png",
  facilities: "/product-images/facilities.png",
};

function getProductImage(product: Product) {
  const name = product.name.toLowerCase();

  if (product.category === "accessory") {
    if (name.includes("keys")) return "/product-images/keyboard.png";
    if (name.includes("master")) return "/product-images/mouse.png";
    if (name.includes("headphone")) return "/product-images/headphones.png";
    return "/product-images/dock.png";
  }
  if (product.category === "furniture") {
    if (name.includes("chair") || name.includes("stool") || name.includes("sofa")) return "/product-images/chair.png";
    if (name.includes("desk") || name.includes("table")) return "/product-images/desk.png";
    if (name.includes("whiteboard") || name.includes("divider")) return "/product-images/whiteboard.png";
    return "/product-images/storage.png";
  }
  if (product.category === "office") {
    if (["label", "shipping", "packing", "bubble", "mailer", "box"].some((term) => name.includes(term))) return "/product-images/packaging.png";
    return "/product-images/paper.png";
  }
  if (product.category === "facilities") {
    if (["coffee", "kettle", "microwave", "water dispenser"].some((term) => name.includes(term))) return "/product-images/breakroom.png";
    if (["first aid", "safety", "fire extinguisher", "ladder"].some((term) => name.includes(term))) return "/product-images/safety.png";
  }
  return categoryImages[product.category];
}

export function ProductVisual({ product, compact = false }: { product: Product; compact?: boolean }) {
  const variant = [...product.id].reduce((total, character) => total + character.charCodeAt(0), 0) % 5;
  return <div className={`commerce-visual render-visual render-${product.category} render-variant-${variant} ${compact ? "render-compact" : ""}`} aria-hidden="true">
    <span className="visual-brand">{product.brand}</span>
    <div className="product-render-shell"><Image src={getProductImage(product)} alt="" fill sizes="(max-width: 620px) 82vw, (max-width: 920px) 38vw, 260px" /></div>
  </div>;
}
