// controllers/cartController.js
import Cart from '../models/cartModel.js';
import Product from '../models/productModel.js';
import mongoose from 'mongoose';
import {
  ValidationError,
  NotFoundError,
  DatabaseError,
  ConflictError
} from '../utils/errors.js';

// Add to Cart with variant support - INCLUDING WEIGHT
export const addToCart = async (req, reply) => {
  const { productId, quantity = 1, variantId } = req.body;
  const userId = req.user._id;

  console.log('🛒 Backend - addToCart request:', {
    userId,
    productId,
    quantity,
    variantId,
    body: req.body
  });

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    console.error('❌ Invalid product ID:', productId);
    throw new ValidationError('Invalid product ID', { productId });
  }

  const product = await Product.findById(productId);
  if (!product) {
    console.error('❌ Product not found:', productId);
    throw new NotFoundError('Product', { productId });
  }

  console.log('✅ Product found:', {
    name: product.name,
    basePrice: product.basePrice,
    variants: product.variants?.length || 0
  });

  let selectedPrice = product.basePrice;
  let availableStock = product.stock;
  let selectedVariant = null;
  let variantName = '';
  let variantImages = [];
  let variantWeight = 0;          // ✅ ADDED
  let variantWeightUnit = 'gram'; // ✅ ADDED

  if (variantId) {
    selectedVariant = product.variants?.find(v => 
      v._id?.toString() === variantId || v.variantName === variantId
    );
    
    if (!selectedVariant) {
      console.error('❌ Variant not found:', variantId);
      throw new NotFoundError('Variant', { variantId });
    }
    
    selectedPrice = selectedVariant.price;
    availableStock = selectedVariant.stock;
    variantName = selectedVariant.variantName;
    
    // ✅ Extract variant images
    if (selectedVariant.images && selectedVariant.images.length > 0) {
      variantImages = selectedVariant.images.map(img => img.image);
      console.log('📸 Storing variant images:', variantImages);
    }
    
    // ✅ Extract variant weight
    variantWeight = selectedVariant.weight || 0;
    variantWeightUnit = selectedVariant.weightUnit || 'gram';
    
    console.log('🎯 Selected variant:', {
      variantName,
      price: selectedPrice,
      stock: availableStock,
      images: variantImages.length,
      weight: `${variantWeight} ${variantWeightUnit}`
    });
  }

  console.log('📦 Stock & price check:', {
    price: selectedPrice,
    availableStock,
    requestedQuantity: quantity,
    weight: `${variantWeight} ${variantWeightUnit}`
  });

  if (availableStock < quantity) {
    console.error('❌ Insufficient stock:', { availableStock, quantity });
    throw new ValidationError('Insufficient stock', {
      availableStock,
      requestedQuantity: quantity
    });
  }

  let cart = await Cart.findOne({ user: userId });
  console.log('🛍️ Existing cart:', cart ? 'Found' : 'Not found');

  if (!cart) {
    cart = new Cart({
      user: userId,
      items: [],
      totalItems: 0,
      totalPrice: 0
    });
    console.log('🆕 Created new cart');
  }

  const existingItemIndex = cart.items.findIndex(item => {
    const sameProduct = item.product.toString() === productId;
    const sameVariant = item.variantId === (selectedVariant?._id?.toString() || variantId || '');
    return sameProduct && sameVariant;
  });

  console.log('🔍 Checking existing items:', {
    totalItems: cart.items.length,
    existingItemIndex,
    searchCriteria: { productId, variantId }
  });

  if (existingItemIndex > -1) {
    const newQuantity = quantity;
    
    if (availableStock < newQuantity) {
      throw new ValidationError('Insufficient stock for requested quantity', {
        availableStock,
        requestedQuantity: newQuantity
      });
    }
    
    // ✅ Update existing item with all variant data including weight
    cart.items[existingItemIndex].quantity = newQuantity;
    cart.items[existingItemIndex].price = selectedPrice;
    cart.items[existingItemIndex].variantName = variantName;
    cart.items[existingItemIndex].variantImages = variantImages;
    cart.items[existingItemIndex].weight = variantWeight;          // ✅ Store weight
    cart.items[existingItemIndex].weightUnit = variantWeightUnit;  // ✅ Store weight unit
    
    console.log('📈 Updated existing item:', {
      quantity: newQuantity,
      weight: `${variantWeight} ${variantWeightUnit}`
    });
  } else {
    // ✅ Add new item with all variant data including weight
    cart.items.push({
      product: productId,
      quantity,
      price: selectedPrice,
      variantId: selectedVariant?._id?.toString() || variantId || '',
      variantName,
      variantImages,
      weight: variantWeight,          // ✅ Store weight
      weightUnit: variantWeightUnit,  // ✅ Store weight unit
      selectedColor: ''
    });
    console.log('➕ Added new item to cart:', {
      product: productId,
      quantity,
      price: selectedPrice,
      variantId,
      variantName,
      variantImagesCount: variantImages.length,
      weight: `${variantWeight} ${variantWeightUnit}`
    });
  }

  // ✅ RECALCULATE TOTALS
  cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
  cart.totalPrice = cart.items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);

  console.log('🧮 Cart totals recalculated:', {
    totalItems: cart.totalItems,
    totalPrice: cart.totalPrice,
    breakdown: cart.items.map(item => 
      `${item.quantity} × ₹${item.price} = ₹${item.quantity * item.price} (${item.weight || 0}${item.weightUnit || 'g'})`
    )
  });

  await cart.save();
  console.log('💾 Cart saved with updated totals');

  await cart.populate('items.product', 'name basePrice images slug stock seller variants');
  console.log('✅ Cart populated with product details');

  reply.status(200).send(cart);
};

// Get Cart
export const getCart = async (req, reply) => {
  const userId = req.user._id;

  const cart = await Cart.findOne({ user: userId })
    .populate('items.product', 'name basePrice images slug stock seller variants');

  if (!cart) {
    // Return empty cart structure
    return reply.status(200).send({
      _id: 'empty-cart',
      user: userId,
      items: [],
      totalPrice: 0,
      totalItems: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // Return cart directly
  reply.status(200).send(cart);
};

// Update Cart Item Quantity
export const updateCartItem = async (req, reply) => {
  const { itemId } = req.params;
  const { quantity } = req.body;
  const userId = req.user._id;

  if (!quantity || quantity < 1) {
    throw new ValidationError('Quantity must be at least 1', {
      field: 'quantity',
      minValue: 1,
      received: quantity
    });
  }

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    throw new NotFoundError('Cart', { userId });
  }

  const cartItem = cart.items.id(itemId);
  if (!cartItem) {
    throw new NotFoundError('Cart item', { itemId });
  }

  // ✅ Check stock based on variant
  const product = await Product.findById(cartItem.product);
  let availableStock = product.stock;
  
  if (cartItem.variantId) {
    const variant = product.variants?.find(v => 
      v._id?.toString() === cartItem.variantId || v.variantName === cartItem.variantId
    );
    if (variant) {
      availableStock = variant.stock;
    }
  }

  // Check stock availability
  if (availableStock < quantity) {
    throw new ValidationError('Insufficient stock', {
      availableStock,
      requestedQuantity: quantity
    });
  }

  cartItem.quantity = quantity;
  await cart.save();
  
  await cart.populate('items.product', 'name basePrice images slug seller stock variants');

  reply.status(200).send(cart);
};

// Remove Item from Cart
export const removeFromCart = async (req, reply) => {
  const { itemId } = req.params;
  const userId = req.user._id;

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    throw new NotFoundError('Cart', { userId });
  }

  const cartItem = cart.items.id(itemId);
  if (!cartItem) {
    throw new NotFoundError('Cart item', { itemId });
  }

  // Remove the item
  cart.items.pull(itemId);
  
  // Recalculate totals
  cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
  cart.totalPrice = cart.items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);

  await cart.save();
  
  await cart.populate('items.product', 'name basePrice images slug seller stock variants');

  reply.status(200).send(cart);
};

// Clear Cart
export const clearCart = async (req, reply) => {
  const userId = req.user._id;

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    throw new NotFoundError('Cart', { userId });
  }

  cart.items = [];
  cart.totalItems = 0;
  cart.totalPrice = 0;
  await cart.save();

  reply.status(200).send({  
    success: true,
    message: 'Cart cleared successfully',
    data: cart
  });
};