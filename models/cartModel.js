// models/cartModel.js
import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  
  // ✅ Store the ACTUAL price paid (either basePrice or variant.price)
  price: {
    type: Number,
    required: true,
    min: 0
  },
  
  // ✅ Store which variant was selected (if any)
  variantId: {
    type: String,
    default: null
  },
  
  // ✅ Also store variant name for display
  variantName: {
    type: String,
    default: ''
  },
  
  // ✅ Store variant images for display in cart
  variantImages: {
    type: [String],
    default: []
  },
  
  // ✅ ADDED: Store weight for display in cart
  weight: {
    type: Number,
    default: 0
  },
  
  // ✅ ADDED: Store weight unit
  weightUnit: {
    type: String,
    default: 'gram'
  },
  
  // ✅ For backward compatibility with colors
  selectedColor: {
    type: String,
    default: ''
  }
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  totalItems: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// ✅ Calculate totals before saving - NO next parameter
cartSchema.pre('save', function() {
  this.totalItems = this.items.reduce((total, item) => total + item.quantity, 0);
  this.totalPrice = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
});

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;