import { ProductPage } from "@/components/products/product-page";

export default async function ProductRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductPage productId={id} />;
}
