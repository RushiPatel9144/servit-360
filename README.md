<!-- @format -->

# Culinary Operations Platform

_A Unified System for Ingredients, Recipes, Menu Items & Theoretical Food Cost Analytics_

---

## 🚀 Overview

The **Culinary Operations Platform** is a full-stack system designed for restaurant groups to centralize and standardize all culinary data:

-   Ingredient specifications & allergen controls
-   Vendor pricing with historical tracking
-   Recipe development with live theoretical costing
-   Menu item management with brand/station/type classification
-   Server POS simulation for table/order punching
-   Theoretical food-cost analytics & sales insights
-   Role-based dashboards for Corporate, Culinary, and Servers

This project models the actual workflows used by large hospitality groups to maintain recipe accuracy, support menu development, and drive financial excellence.

---

## 🧩 Key Features

### **1. Ingredients Manager**

-   Add/edit ingredients
-   Units, allergens, and vendor/location fields
-   Vendor pricing history with automatic timestamping
-   Real-time unit cost retrieval for recipe costing

### **2. Recipe Manager**

-   Create and maintain recipes with:
    -   Yield
    -   Shelf life
    -   Tools
    -   Method
    -   Ingredient lines (qty + unit)
-   Auto-calculated:
    -   Total recipe cost
    -   Cost per portion
    -   Allergen roll-up from all ingredient lines
    -   Full cost breakdown table

### **3. Menu Manager**

-   Map recipes → menu items
-   Brand, type, station assignment
-   Active/inactive toggles
-   Sell price management with history

### **4. Server POS Dashboard**

-   Realistic restaurant workflow simulation
-   Open tables, add/remove items, apply tips
-   Sends orders to Firestore (`serverSales`)
-   Mirrors real POS behavior for testing food-cost logic

### **5. Sales & Food Cost Insights (HQ Dashboard)**

-   Selectable date range (calendar)
-   Aggregated high-level KPIs:
    -   Total sales
    -   Theoretical COGS
    -   Food cost % vs target
    -   Variance %
-   Location performance breakdown
-   Daily sales, COGS, avg check
-   Top 10 menu items by sales
-   Worst 5 items by food-cost %

---

## 🏛 Architecture

### **Frontend**

-   React (Vite)
-   TailwindCSS
-   React Router
-   Modular roles-based page structure
-   Modern, responsive dark UI

### **Backend**

-   Firebase Authentication
-   Firestore (NoSQL)

### **Firestore Structure**

```
ingredients/
  {ingredientId}/prices/
recipes/
menuItems/
  {menuItemId}/prices/
serverSales/
servers/
users/
```

-   All price updates use Firestore `writeBatch` for atomic updates
-   Costing engine pulls latest price per ingredient

---

## 🔐 Roles & Dashboards

| Role          | Access                                     |
| ------------- | ------------------------------------------ |
| **Corporate** | Ingredients, Recipes, Menu, Sales Insights |
| **Culinary**  | Recipes + Menu Manager                     |
| **Server**    | POS Dashboard                              |

Routing automatically sends `/dashboard` → correct page based on stored role.

---

## 🛠 Development Setup

### **1. Clone**

```bash
git clone https://github.com/your-repo/culinary-ops-platform.git
cd culinary-ops-platform
```

### **2. Install**

```bash
npm install
```

### **3. Add Firebase Environment Variables**

Create `.env`:

```
VITE_FIREBASE_API_KEY=xxxx
VITE_FIREBASE_AUTH_DOMAIN=xxxx
VITE_FIREBASE_PROJECT_ID=xxxx
VITE_FIREBASE_STORAGE_BUCKET=xxxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxxx
VITE_FIREBASE_APP_ID=xxxx
```

### **4. Run**

```bash
npm run dev
```

---

## 🧪 Seed Utilities

Development seeders are available for:

-   Ingredients
-   Recipes
-   Menu items
-   Server accounts
-   Example sales entries

Routes:

```
/dev-seed
/dev-seed2
/dev-seed-servers
/dev-menu-seed
```

_(These should be disabled in production builds.)_

---

## 📊 Simplified Firestore Rules

```js
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

Production usage should adopt stricter role-based rules.

---

## 🖥 Deployment (Vercel)

-   Compatible with Vercel out of the box
-   SPA routing works via fallback to `index.html`
-   Ensure `.env` variables are populated in Vercel dashboard
-   Fixes applied for Vite + Firebase auth in production

---

## 📘 Future Enhancements

-   Inventory & stock depletion
-   Prep list generator
-   Waste / spoilage tracking
-   Category-level mix reporting
-   Labour-to-sales integration
-   Real-time sales feeds
-   Multi-brand deep reporting

---

## 👤 Author

**Rushi Patel**  
Full-Stack Developer & Culinary Systems Enthusiast  
_(Internal project)_

---
