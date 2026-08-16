// ============================================================
// JB Digital Printing — Firebase Configuration
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBIGsv78X8iNm_-BtECfsE9C_DI2JIpeqY",
  authDomain: "jb-digitalprinting.firebaseapp.com",
  projectId: "jb-digitalprinting",
  storageBucket: "jb-digitalprinting.firebasestorage.app",
  messagingSenderId: "862348945523",
  appId: "1:862348945523:web:c97457fc9daac37fec2206"
};

// Collections
const COLL = {
  users: 'users',
  customers: 'customers',
  suppliers: 'suppliers',
  sales: 'sales',
  expenses: 'expenses',
  inventory: 'inventory',
  invTx: 'inventory_transactions',
  projects: 'projects',
  projRev: 'project_revenue',
  projExp: 'project_expenses',
  payments: 'payments',
  categories: 'categories',
  settings: 'settings',
  audit: 'audit_logs',
  backups: 'backups'
};

// App constants
const APP_NAME = 'JB Digital Printing';
const DEFAULT_CURRENCY = '₱';
const DEFAULT_SALE_CATEGORIES = ['Tarpaulin', 'Sticker', 'T-Shirt / Apparel', 'ID / Lanyard', 'Sintra Board', 'Photo Print', 'Lamination', 'Business Card', 'Flyer / Leaflet', 'Certificates', 'Other'];
const DEFAULT_EXPENSE_CATEGORIES = ['Materials', 'Ink', 'Tarpaulin', 'Sticker Material', 'DTF Film', 'DTF Powder', 'Sublimation Paper', 'Vinyl', 'Electricity', 'Water', 'Rent', 'Internet', 'Delivery', 'Transportation', 'Maintenance', 'Printer Repair', 'Equipment', 'Salary/Labor', 'Marketing', 'Office Supplies', 'Other'];
const PROJECT_STATUSES = ['Quotation', 'Pending', 'In Production', 'Completed', 'Delivered', 'Cancelled'];
const INVENTORY_UNITS = ['meter', 'roll', 'piece', 'pc', 'pack', 'bottle', 'liter', 'kg', 'box', 'set', 'sheet', 'ream', 'yard', 'bundle', 'pair', 'dozen', 'bag', 'can', 'cartridge', 'other'];
const INV_TX_TYPES = ['restock', 'usage', 'sold', 'damaged', 'lost', 'adjustment'];
const PAYMENT_METHODS = ['Cash', 'GCash', 'Bank Transfer', 'Other'];
const PAYMENT_STATUSES = ['Paid', 'Partial', 'Unpaid'];
const RETENTION_MODES = ['archive', 'delete', 'disabled'];
const ROLES = ['admin', 'staff', 'viewer'];
// Owner emails — always forced to admin role (safety net)
const ADMIN_EMAILS = ['mr.sebuguero@gmail.com'];
