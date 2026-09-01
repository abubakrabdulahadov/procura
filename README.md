# Procura

Procura is a WebMCP-enabled procurement marketplace where people and AI agents can research
workplace products, compare tradeoffs, manage a cart, and prepare an order together. A person
always reviews and approves an agent-prepared order before it can be placed.

**Live demo:** [procura-demo.up.railway.app](https://procura-demo.up.railway.app/)

## Why WebMCP

Procurement combines specifications, price, delivery, financing, purchase history, and spending
limits. Procura exposes these capabilities as structured browser tools, so an agent can handle
repetitive research while the person controls the final decision.

Together, a person and their agent can:

- search and filter a deterministic workplace catalog;
- inspect specifications, availability, reviews, and installment options;
- compare products in the same table the person sees and highlight recommendations;
- manage the signed-in user's cart and preview costs against their budget;
- prepare an order and request explicit human approval;
- inspect, cancel, restore, or reorder previous purchases.

## Human approval flow

```text
Agent researches products and prepares a proposal
                         ↓
Procura opens a priced approval panel in the browser
                         ↓
The person reviews items, payment terms, delivery, and budget
                         ↓
The person approves or rejects the proposal
                         ↓
Procura revalidates cart, availability, and budget before placement
```

The agent cannot approve its own request. Order placement refuses unapproved, changed,
unavailable, or over-budget proposals.

## WebMCP implementation

The client registers tools through `document.modelContext.registerTool`. Public tools cover
catalog discovery and navigation; account-specific tools are registered only while the user is
signed in. Tool calls reuse the same procurement modules and API routes as the human UI.

The app exposes 25 tools, including:

- `search_products`, `get_product_details`, `get_product_reviews`;
- `compare_products`, `highlight_products`, `navigate_to`;
- `view_cart`, `add_to_cart`, `bulk_add_to_cart`, `update_cart_quantity`;
- `get_budget`, `set_budget`, `get_spending_analytics`;
- `preview_order`, `request_order_approval`, `check_order_approval`;
- `view_orders`, `get_order_details`, `cancel_order`, `restore_cancelled_order`, `reorder`.

Registration failures are reported in the browser console and are not presented as successfully
registered tools.

## Tech stack

- Next.js 16, React 19, and TypeScript
- Tailwind CSS
- PostgreSQL with Drizzle ORM
- pnpm and Vitest

## Local setup

Requirements: Node.js 20+, pnpm 11+, and PostgreSQL.

1. Copy `.env.example` to `.env.local`.
2. Set `DATABASE_URL` to a PostgreSQL database.
3. Set `SESSION_SECRET` to a long random value.
4. Run `pnpm install`.
5. Apply migrations with `pnpm db:migrate`.
6. Start the app with `pnpm dev`.
7. Open `http://localhost:3000` and create an account.

For a production server, `pnpm start` applies pending migrations before starting Next.js.

## Testing WebMCP

- Open the deployed app in ChatGPT's in-app browser; or
- enable `chrome://flags/#enable-webmcp-testing` in a compatible Google Chrome build.

A useful demo prompt is:

> Find two 27-inch USB-C monitors under $500, compare them on screen, recommend one, add two to
> my cart, preview the order against my budget, and ask me to approve it.

## Quality checks

```text
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
pnpm build
```

## Deployment

The public demo is deployed on Railway at
[procura-demo.up.railway.app](https://procura-demo.up.railway.app/). A deployment needs
`DATABASE_URL` and `SESSION_SECRET` as production environment variables. The database user must
be allowed to apply the included migrations.

## License

Procura is released under the [MIT License](LICENSE).
