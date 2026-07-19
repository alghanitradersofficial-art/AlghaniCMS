import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { ActivityItem, Brand, BrandInput, BrandUpdate, Category, CategoryInput, CategoryUpdate, ChartDataPoint, Customer, CustomerInput, CustomerList, CustomerUpdate, DashboardSummary, Expense, ExpenseInput, ExpenseList, ExpenseUpdate, GetCustomersParams, GetExpensesParams, GetProductsParams, GetProfitLossReportParams, GetPurchasesParams, GetSalesChartParams, GetSalesParams, GetSuppliersParams, HealthStatus, InventoryReport, LowStockAlert, Product, ProductInput, ProductList, ProductUpdate, ProfitLossReport, Purchase, PurchaseInput, PurchaseList, PurchaseUpdate, Sale, SaleInput, SaleList, SaleUpdate, Supplier, SupplierInput, SupplierUpdate, TopProduct, User, UserInput, UserUpdate } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDashboardSummaryUrl: () => string;
/**
 * @summary Get dashboard KPI summary
 */
export declare const getDashboardSummary: (options?: RequestInit) => Promise<DashboardSummary>;
export declare const getGetDashboardSummaryQueryKey: () => readonly ["/api/dashboard/summary"];
export declare const getGetDashboardSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardSummary>>>;
export type GetDashboardSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Get dashboard KPI summary
 */
export declare function useGetDashboardSummary<TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetSalesChartUrl: (params?: GetSalesChartParams) => string;
/**
 * @summary Get monthly sales chart data
 */
export declare const getSalesChart: (params?: GetSalesChartParams, options?: RequestInit) => Promise<ChartDataPoint[]>;
export declare const getGetSalesChartQueryKey: (params?: GetSalesChartParams) => readonly ["/api/dashboard/sales-chart", ...GetSalesChartParams[]];
export declare const getGetSalesChartQueryOptions: <TData = Awaited<ReturnType<typeof getSalesChart>>, TError = ErrorType<unknown>>(params?: GetSalesChartParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSalesChart>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSalesChart>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSalesChartQueryResult = NonNullable<Awaited<ReturnType<typeof getSalesChart>>>;
export type GetSalesChartQueryError = ErrorType<unknown>;
/**
 * @summary Get monthly sales chart data
 */
export declare function useGetSalesChart<TData = Awaited<ReturnType<typeof getSalesChart>>, TError = ErrorType<unknown>>(params?: GetSalesChartParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSalesChart>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetRecentActivityUrl: () => string;
/**
 * @summary Get recent activity feed
 */
export declare const getRecentActivity: (options?: RequestInit) => Promise<ActivityItem[]>;
export declare const getGetRecentActivityQueryKey: () => readonly ["/api/dashboard/recent-activity"];
export declare const getGetRecentActivityQueryOptions: <TData = Awaited<ReturnType<typeof getRecentActivity>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetRecentActivityQueryResult = NonNullable<Awaited<ReturnType<typeof getRecentActivity>>>;
export type GetRecentActivityQueryError = ErrorType<unknown>;
/**
 * @summary Get recent activity feed
 */
export declare function useGetRecentActivity<TData = Awaited<ReturnType<typeof getRecentActivity>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetTopProductsUrl: () => string;
/**
 * @summary Get top selling products
 */
export declare const getTopProducts: (options?: RequestInit) => Promise<TopProduct[]>;
export declare const getGetTopProductsQueryKey: () => readonly ["/api/dashboard/top-products"];
export declare const getGetTopProductsQueryOptions: <TData = Awaited<ReturnType<typeof getTopProducts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTopProducts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTopProducts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTopProductsQueryResult = NonNullable<Awaited<ReturnType<typeof getTopProducts>>>;
export type GetTopProductsQueryError = ErrorType<unknown>;
/**
 * @summary Get top selling products
 */
export declare function useGetTopProducts<TData = Awaited<ReturnType<typeof getTopProducts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTopProducts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetLowStockAlertsUrl: () => string;
/**
 * @summary Get low stock alerts
 */
export declare const getLowStockAlerts: (options?: RequestInit) => Promise<LowStockAlert[]>;
export declare const getGetLowStockAlertsQueryKey: () => readonly ["/api/dashboard/low-stock"];
export declare const getGetLowStockAlertsQueryOptions: <TData = Awaited<ReturnType<typeof getLowStockAlerts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLowStockAlerts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getLowStockAlerts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetLowStockAlertsQueryResult = NonNullable<Awaited<ReturnType<typeof getLowStockAlerts>>>;
export type GetLowStockAlertsQueryError = ErrorType<unknown>;
/**
 * @summary Get low stock alerts
 */
export declare function useGetLowStockAlerts<TData = Awaited<ReturnType<typeof getLowStockAlerts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLowStockAlerts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetProductsUrl: (params?: GetProductsParams) => string;
/**
 * @summary List all products
 */
export declare const getProducts: (params?: GetProductsParams, options?: RequestInit) => Promise<ProductList>;
export declare const getGetProductsQueryKey: (params?: GetProductsParams) => readonly ["/api/products", ...GetProductsParams[]];
export declare const getGetProductsQueryOptions: <TData = Awaited<ReturnType<typeof getProducts>>, TError = ErrorType<unknown>>(params?: GetProductsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProducts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProducts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProductsQueryResult = NonNullable<Awaited<ReturnType<typeof getProducts>>>;
export type GetProductsQueryError = ErrorType<unknown>;
/**
 * @summary List all products
 */
export declare function useGetProducts<TData = Awaited<ReturnType<typeof getProducts>>, TError = ErrorType<unknown>>(params?: GetProductsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProducts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateProductUrl: () => string;
/**
 * @summary Create a new product
 */
export declare const createProduct: (productInput: ProductInput, options?: RequestInit) => Promise<Product>;
export declare const getCreateProductMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProduct>>, TError, {
        data: BodyType<ProductInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createProduct>>, TError, {
    data: BodyType<ProductInput>;
}, TContext>;
export type CreateProductMutationResult = NonNullable<Awaited<ReturnType<typeof createProduct>>>;
export type CreateProductMutationBody = BodyType<ProductInput>;
export type CreateProductMutationError = ErrorType<unknown>;
/**
* @summary Create a new product
*/
export declare const useCreateProduct: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProduct>>, TError, {
        data: BodyType<ProductInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createProduct>>, TError, {
    data: BodyType<ProductInput>;
}, TContext>;
export declare const getGetProductUrl: (id: number) => string;
/**
 * @summary Get product by ID
 */
export declare const getProduct: (id: number, options?: RequestInit) => Promise<Product>;
export declare const getGetProductQueryKey: (id: number) => readonly [`/api/products/${number}`];
export declare const getGetProductQueryOptions: <TData = Awaited<ReturnType<typeof getProduct>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProduct>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProduct>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProductQueryResult = NonNullable<Awaited<ReturnType<typeof getProduct>>>;
export type GetProductQueryError = ErrorType<unknown>;
/**
 * @summary Get product by ID
 */
export declare function useGetProduct<TData = Awaited<ReturnType<typeof getProduct>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProduct>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateProductUrl: (id: number) => string;
/**
 * @summary Update a product
 */
export declare const updateProduct: (id: number, productUpdate: ProductUpdate, options?: RequestInit) => Promise<Product>;
export declare const getUpdateProductMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProduct>>, TError, {
        id: number;
        data: BodyType<ProductUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateProduct>>, TError, {
    id: number;
    data: BodyType<ProductUpdate>;
}, TContext>;
export type UpdateProductMutationResult = NonNullable<Awaited<ReturnType<typeof updateProduct>>>;
export type UpdateProductMutationBody = BodyType<ProductUpdate>;
export type UpdateProductMutationError = ErrorType<unknown>;
/**
* @summary Update a product
*/
export declare const useUpdateProduct: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProduct>>, TError, {
        id: number;
        data: BodyType<ProductUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateProduct>>, TError, {
    id: number;
    data: BodyType<ProductUpdate>;
}, TContext>;
export declare const getDeleteProductUrl: (id: number) => string;
/**
 * @summary Delete a product
 */
export declare const deleteProduct: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteProductMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProduct>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteProduct>>, TError, {
    id: number;
}, TContext>;
export type DeleteProductMutationResult = NonNullable<Awaited<ReturnType<typeof deleteProduct>>>;
export type DeleteProductMutationError = ErrorType<unknown>;
/**
* @summary Delete a product
*/
export declare const useDeleteProduct: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProduct>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteProduct>>, TError, {
    id: number;
}, TContext>;
export declare const getGetCategoriesUrl: () => string;
/**
 * @summary List all categories
 */
export declare const getCategories: (options?: RequestInit) => Promise<Category[]>;
export declare const getGetCategoriesQueryKey: () => readonly ["/api/categories"];
export declare const getGetCategoriesQueryOptions: <TData = Awaited<ReturnType<typeof getCategories>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCategories>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCategoriesQueryResult = NonNullable<Awaited<ReturnType<typeof getCategories>>>;
export type GetCategoriesQueryError = ErrorType<unknown>;
/**
 * @summary List all categories
 */
export declare function useGetCategories<TData = Awaited<ReturnType<typeof getCategories>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateCategoryUrl: () => string;
/**
 * @summary Create a category
 */
export declare const createCategory: (categoryInput: CategoryInput, options?: RequestInit) => Promise<Category>;
export declare const getCreateCategoryMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCategory>>, TError, {
        data: BodyType<CategoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createCategory>>, TError, {
    data: BodyType<CategoryInput>;
}, TContext>;
export type CreateCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof createCategory>>>;
export type CreateCategoryMutationBody = BodyType<CategoryInput>;
export type CreateCategoryMutationError = ErrorType<unknown>;
/**
* @summary Create a category
*/
export declare const useCreateCategory: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCategory>>, TError, {
        data: BodyType<CategoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createCategory>>, TError, {
    data: BodyType<CategoryInput>;
}, TContext>;
export declare const getUpdateCategoryUrl: (id: number) => string;
/**
 * @summary Update a category
 */
export declare const updateCategory: (id: number, categoryUpdate: CategoryUpdate, options?: RequestInit) => Promise<Category>;
export declare const getUpdateCategoryMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCategory>>, TError, {
        id: number;
        data: BodyType<CategoryUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateCategory>>, TError, {
    id: number;
    data: BodyType<CategoryUpdate>;
}, TContext>;
export type UpdateCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof updateCategory>>>;
export type UpdateCategoryMutationBody = BodyType<CategoryUpdate>;
export type UpdateCategoryMutationError = ErrorType<unknown>;
/**
* @summary Update a category
*/
export declare const useUpdateCategory: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCategory>>, TError, {
        id: number;
        data: BodyType<CategoryUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateCategory>>, TError, {
    id: number;
    data: BodyType<CategoryUpdate>;
}, TContext>;
export declare const getDeleteCategoryUrl: (id: number) => string;
/**
 * @summary Delete a category
 */
export declare const deleteCategory: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteCategoryMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCategory>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteCategory>>, TError, {
    id: number;
}, TContext>;
export type DeleteCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof deleteCategory>>>;
export type DeleteCategoryMutationError = ErrorType<unknown>;
/**
* @summary Delete a category
*/
export declare const useDeleteCategory: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCategory>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteCategory>>, TError, {
    id: number;
}, TContext>;
export declare const getGetBrandsUrl: () => string;
/**
 * @summary List all brands
 */
export declare const getBrands: (options?: RequestInit) => Promise<Brand[]>;
export declare const getGetBrandsQueryKey: () => readonly ["/api/brands"];
export declare const getGetBrandsQueryOptions: <TData = Awaited<ReturnType<typeof getBrands>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBrands>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getBrands>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetBrandsQueryResult = NonNullable<Awaited<ReturnType<typeof getBrands>>>;
export type GetBrandsQueryError = ErrorType<unknown>;
/**
 * @summary List all brands
 */
export declare function useGetBrands<TData = Awaited<ReturnType<typeof getBrands>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBrands>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateBrandUrl: () => string;
/**
 * @summary Create a brand
 */
export declare const createBrand: (brandInput: BrandInput, options?: RequestInit) => Promise<Brand>;
export declare const getCreateBrandMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createBrand>>, TError, {
        data: BodyType<BrandInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createBrand>>, TError, {
    data: BodyType<BrandInput>;
}, TContext>;
export type CreateBrandMutationResult = NonNullable<Awaited<ReturnType<typeof createBrand>>>;
export type CreateBrandMutationBody = BodyType<BrandInput>;
export type CreateBrandMutationError = ErrorType<unknown>;
/**
* @summary Create a brand
*/
export declare const useCreateBrand: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createBrand>>, TError, {
        data: BodyType<BrandInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createBrand>>, TError, {
    data: BodyType<BrandInput>;
}, TContext>;
export declare const getUpdateBrandUrl: (id: number) => string;
/**
 * @summary Update a brand
 */
export declare const updateBrand: (id: number, brandUpdate: BrandUpdate, options?: RequestInit) => Promise<Brand>;
export declare const getUpdateBrandMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateBrand>>, TError, {
        id: number;
        data: BodyType<BrandUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateBrand>>, TError, {
    id: number;
    data: BodyType<BrandUpdate>;
}, TContext>;
export type UpdateBrandMutationResult = NonNullable<Awaited<ReturnType<typeof updateBrand>>>;
export type UpdateBrandMutationBody = BodyType<BrandUpdate>;
export type UpdateBrandMutationError = ErrorType<unknown>;
/**
* @summary Update a brand
*/
export declare const useUpdateBrand: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateBrand>>, TError, {
        id: number;
        data: BodyType<BrandUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateBrand>>, TError, {
    id: number;
    data: BodyType<BrandUpdate>;
}, TContext>;
export declare const getDeleteBrandUrl: (id: number) => string;
/**
 * @summary Delete a brand
 */
export declare const deleteBrand: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteBrandMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteBrand>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteBrand>>, TError, {
    id: number;
}, TContext>;
export type DeleteBrandMutationResult = NonNullable<Awaited<ReturnType<typeof deleteBrand>>>;
export type DeleteBrandMutationError = ErrorType<unknown>;
/**
* @summary Delete a brand
*/
export declare const useDeleteBrand: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteBrand>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteBrand>>, TError, {
    id: number;
}, TContext>;
export declare const getGetSalesUrl: (params?: GetSalesParams) => string;
/**
 * @summary List all sales orders
 */
export declare const getSales: (params?: GetSalesParams, options?: RequestInit) => Promise<SaleList>;
export declare const getGetSalesQueryKey: (params?: GetSalesParams) => readonly ["/api/sales", ...GetSalesParams[]];
export declare const getGetSalesQueryOptions: <TData = Awaited<ReturnType<typeof getSales>>, TError = ErrorType<unknown>>(params?: GetSalesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSales>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSales>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSalesQueryResult = NonNullable<Awaited<ReturnType<typeof getSales>>>;
export type GetSalesQueryError = ErrorType<unknown>;
/**
 * @summary List all sales orders
 */
export declare function useGetSales<TData = Awaited<ReturnType<typeof getSales>>, TError = ErrorType<unknown>>(params?: GetSalesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSales>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateSaleUrl: () => string;
/**
 * @summary Create a sale order
 */
export declare const createSale: (saleInput: SaleInput, options?: RequestInit) => Promise<Sale>;
export declare const getCreateSaleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createSale>>, TError, {
        data: BodyType<SaleInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createSale>>, TError, {
    data: BodyType<SaleInput>;
}, TContext>;
export type CreateSaleMutationResult = NonNullable<Awaited<ReturnType<typeof createSale>>>;
export type CreateSaleMutationBody = BodyType<SaleInput>;
export type CreateSaleMutationError = ErrorType<unknown>;
/**
* @summary Create a sale order
*/
export declare const useCreateSale: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createSale>>, TError, {
        data: BodyType<SaleInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createSale>>, TError, {
    data: BodyType<SaleInput>;
}, TContext>;
export declare const getGetSaleUrl: (id: number) => string;
/**
 * @summary Get sale by ID
 */
export declare const getSale: (id: number, options?: RequestInit) => Promise<Sale>;
export declare const getGetSaleQueryKey: (id: number) => readonly [`/api/sales/${number}`];
export declare const getGetSaleQueryOptions: <TData = Awaited<ReturnType<typeof getSale>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSale>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSale>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSaleQueryResult = NonNullable<Awaited<ReturnType<typeof getSale>>>;
export type GetSaleQueryError = ErrorType<unknown>;
/**
 * @summary Get sale by ID
 */
export declare function useGetSale<TData = Awaited<ReturnType<typeof getSale>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSale>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateSaleUrl: (id: number) => string;
/**
 * @summary Update sale status
 */
export declare const updateSale: (id: number, saleUpdate: SaleUpdate, options?: RequestInit) => Promise<Sale>;
export declare const getUpdateSaleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSale>>, TError, {
        id: number;
        data: BodyType<SaleUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateSale>>, TError, {
    id: number;
    data: BodyType<SaleUpdate>;
}, TContext>;
export type UpdateSaleMutationResult = NonNullable<Awaited<ReturnType<typeof updateSale>>>;
export type UpdateSaleMutationBody = BodyType<SaleUpdate>;
export type UpdateSaleMutationError = ErrorType<unknown>;
/**
* @summary Update sale status
*/
export declare const useUpdateSale: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSale>>, TError, {
        id: number;
        data: BodyType<SaleUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateSale>>, TError, {
    id: number;
    data: BodyType<SaleUpdate>;
}, TContext>;
export declare const getDeleteSaleUrl: (id: number) => string;
/**
 * @summary Delete a sale
 */
export declare const deleteSale: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteSaleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteSale>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteSale>>, TError, {
    id: number;
}, TContext>;
export type DeleteSaleMutationResult = NonNullable<Awaited<ReturnType<typeof deleteSale>>>;
export type DeleteSaleMutationError = ErrorType<unknown>;
/**
* @summary Delete a sale
*/
export declare const useDeleteSale: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteSale>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteSale>>, TError, {
    id: number;
}, TContext>;
export declare const getGetPurchasesUrl: (params?: GetPurchasesParams) => string;
/**
 * @summary List all purchase orders
 */
export declare const getPurchases: (params?: GetPurchasesParams, options?: RequestInit) => Promise<PurchaseList>;
export declare const getGetPurchasesQueryKey: (params?: GetPurchasesParams) => readonly ["/api/purchases", ...GetPurchasesParams[]];
export declare const getGetPurchasesQueryOptions: <TData = Awaited<ReturnType<typeof getPurchases>>, TError = ErrorType<unknown>>(params?: GetPurchasesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPurchases>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPurchases>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPurchasesQueryResult = NonNullable<Awaited<ReturnType<typeof getPurchases>>>;
export type GetPurchasesQueryError = ErrorType<unknown>;
/**
 * @summary List all purchase orders
 */
export declare function useGetPurchases<TData = Awaited<ReturnType<typeof getPurchases>>, TError = ErrorType<unknown>>(params?: GetPurchasesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPurchases>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreatePurchaseUrl: () => string;
/**
 * @summary Create a purchase order
 */
export declare const createPurchase: (purchaseInput: PurchaseInput, options?: RequestInit) => Promise<Purchase>;
export declare const getCreatePurchaseMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createPurchase>>, TError, {
        data: BodyType<PurchaseInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createPurchase>>, TError, {
    data: BodyType<PurchaseInput>;
}, TContext>;
export type CreatePurchaseMutationResult = NonNullable<Awaited<ReturnType<typeof createPurchase>>>;
export type CreatePurchaseMutationBody = BodyType<PurchaseInput>;
export type CreatePurchaseMutationError = ErrorType<unknown>;
/**
* @summary Create a purchase order
*/
export declare const useCreatePurchase: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createPurchase>>, TError, {
        data: BodyType<PurchaseInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createPurchase>>, TError, {
    data: BodyType<PurchaseInput>;
}, TContext>;
export declare const getGetPurchaseUrl: (id: number) => string;
/**
 * @summary Get purchase by ID
 */
export declare const getPurchase: (id: number, options?: RequestInit) => Promise<Purchase>;
export declare const getGetPurchaseQueryKey: (id: number) => readonly [`/api/purchases/${number}`];
export declare const getGetPurchaseQueryOptions: <TData = Awaited<ReturnType<typeof getPurchase>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPurchase>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPurchase>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPurchaseQueryResult = NonNullable<Awaited<ReturnType<typeof getPurchase>>>;
export type GetPurchaseQueryError = ErrorType<unknown>;
/**
 * @summary Get purchase by ID
 */
export declare function useGetPurchase<TData = Awaited<ReturnType<typeof getPurchase>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPurchase>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdatePurchaseUrl: (id: number) => string;
/**
 * @summary Update purchase
 */
export declare const updatePurchase: (id: number, purchaseUpdate: PurchaseUpdate, options?: RequestInit) => Promise<Purchase>;
export declare const getUpdatePurchaseMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updatePurchase>>, TError, {
        id: number;
        data: BodyType<PurchaseUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updatePurchase>>, TError, {
    id: number;
    data: BodyType<PurchaseUpdate>;
}, TContext>;
export type UpdatePurchaseMutationResult = NonNullable<Awaited<ReturnType<typeof updatePurchase>>>;
export type UpdatePurchaseMutationBody = BodyType<PurchaseUpdate>;
export type UpdatePurchaseMutationError = ErrorType<unknown>;
/**
* @summary Update purchase
*/
export declare const useUpdatePurchase: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updatePurchase>>, TError, {
        id: number;
        data: BodyType<PurchaseUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updatePurchase>>, TError, {
    id: number;
    data: BodyType<PurchaseUpdate>;
}, TContext>;
export declare const getGetCustomersUrl: (params?: GetCustomersParams) => string;
/**
 * @summary List all customers
 */
export declare const getCustomers: (params?: GetCustomersParams, options?: RequestInit) => Promise<CustomerList>;
export declare const getGetCustomersQueryKey: (params?: GetCustomersParams) => readonly ["/api/customers", ...GetCustomersParams[]];
export declare const getGetCustomersQueryOptions: <TData = Awaited<ReturnType<typeof getCustomers>>, TError = ErrorType<unknown>>(params?: GetCustomersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCustomers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCustomers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCustomersQueryResult = NonNullable<Awaited<ReturnType<typeof getCustomers>>>;
export type GetCustomersQueryError = ErrorType<unknown>;
/**
 * @summary List all customers
 */
export declare function useGetCustomers<TData = Awaited<ReturnType<typeof getCustomers>>, TError = ErrorType<unknown>>(params?: GetCustomersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCustomers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateCustomerUrl: () => string;
/**
 * @summary Create a customer
 */
export declare const createCustomer: (customerInput: CustomerInput, options?: RequestInit) => Promise<Customer>;
export declare const getCreateCustomerMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCustomer>>, TError, {
        data: BodyType<CustomerInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createCustomer>>, TError, {
    data: BodyType<CustomerInput>;
}, TContext>;
export type CreateCustomerMutationResult = NonNullable<Awaited<ReturnType<typeof createCustomer>>>;
export type CreateCustomerMutationBody = BodyType<CustomerInput>;
export type CreateCustomerMutationError = ErrorType<unknown>;
/**
* @summary Create a customer
*/
export declare const useCreateCustomer: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCustomer>>, TError, {
        data: BodyType<CustomerInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createCustomer>>, TError, {
    data: BodyType<CustomerInput>;
}, TContext>;
export declare const getGetCustomerUrl: (id: number) => string;
/**
 * @summary Get customer by ID
 */
export declare const getCustomer: (id: number, options?: RequestInit) => Promise<Customer>;
export declare const getGetCustomerQueryKey: (id: number) => readonly [`/api/customers/${number}`];
export declare const getGetCustomerQueryOptions: <TData = Awaited<ReturnType<typeof getCustomer>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCustomer>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCustomer>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCustomerQueryResult = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;
export type GetCustomerQueryError = ErrorType<unknown>;
/**
 * @summary Get customer by ID
 */
export declare function useGetCustomer<TData = Awaited<ReturnType<typeof getCustomer>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCustomer>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateCustomerUrl: (id: number) => string;
/**
 * @summary Update a customer
 */
export declare const updateCustomer: (id: number, customerUpdate: CustomerUpdate, options?: RequestInit) => Promise<Customer>;
export declare const getUpdateCustomerMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCustomer>>, TError, {
        id: number;
        data: BodyType<CustomerUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateCustomer>>, TError, {
    id: number;
    data: BodyType<CustomerUpdate>;
}, TContext>;
export type UpdateCustomerMutationResult = NonNullable<Awaited<ReturnType<typeof updateCustomer>>>;
export type UpdateCustomerMutationBody = BodyType<CustomerUpdate>;
export type UpdateCustomerMutationError = ErrorType<unknown>;
/**
* @summary Update a customer
*/
export declare const useUpdateCustomer: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCustomer>>, TError, {
        id: number;
        data: BodyType<CustomerUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateCustomer>>, TError, {
    id: number;
    data: BodyType<CustomerUpdate>;
}, TContext>;
export declare const getDeleteCustomerUrl: (id: number) => string;
/**
 * @summary Delete a customer
 */
export declare const deleteCustomer: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteCustomerMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCustomer>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteCustomer>>, TError, {
    id: number;
}, TContext>;
export type DeleteCustomerMutationResult = NonNullable<Awaited<ReturnType<typeof deleteCustomer>>>;
export type DeleteCustomerMutationError = ErrorType<unknown>;
/**
* @summary Delete a customer
*/
export declare const useDeleteCustomer: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCustomer>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteCustomer>>, TError, {
    id: number;
}, TContext>;
export declare const getGetSuppliersUrl: (params?: GetSuppliersParams) => string;
/**
 * @summary List all suppliers
 */
export declare const getSuppliers: (params?: GetSuppliersParams, options?: RequestInit) => Promise<Supplier[]>;
export declare const getGetSuppliersQueryKey: (params?: GetSuppliersParams) => readonly ["/api/suppliers", ...GetSuppliersParams[]];
export declare const getGetSuppliersQueryOptions: <TData = Awaited<ReturnType<typeof getSuppliers>>, TError = ErrorType<unknown>>(params?: GetSuppliersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSuppliers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSuppliers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSuppliersQueryResult = NonNullable<Awaited<ReturnType<typeof getSuppliers>>>;
export type GetSuppliersQueryError = ErrorType<unknown>;
/**
 * @summary List all suppliers
 */
export declare function useGetSuppliers<TData = Awaited<ReturnType<typeof getSuppliers>>, TError = ErrorType<unknown>>(params?: GetSuppliersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSuppliers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateSupplierUrl: () => string;
/**
 * @summary Create a supplier
 */
export declare const createSupplier: (supplierInput: SupplierInput, options?: RequestInit) => Promise<Supplier>;
export declare const getCreateSupplierMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createSupplier>>, TError, {
        data: BodyType<SupplierInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createSupplier>>, TError, {
    data: BodyType<SupplierInput>;
}, TContext>;
export type CreateSupplierMutationResult = NonNullable<Awaited<ReturnType<typeof createSupplier>>>;
export type CreateSupplierMutationBody = BodyType<SupplierInput>;
export type CreateSupplierMutationError = ErrorType<unknown>;
/**
* @summary Create a supplier
*/
export declare const useCreateSupplier: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createSupplier>>, TError, {
        data: BodyType<SupplierInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createSupplier>>, TError, {
    data: BodyType<SupplierInput>;
}, TContext>;
export declare const getUpdateSupplierUrl: (id: number) => string;
/**
 * @summary Update a supplier
 */
export declare const updateSupplier: (id: number, supplierUpdate: SupplierUpdate, options?: RequestInit) => Promise<Supplier>;
export declare const getUpdateSupplierMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSupplier>>, TError, {
        id: number;
        data: BodyType<SupplierUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateSupplier>>, TError, {
    id: number;
    data: BodyType<SupplierUpdate>;
}, TContext>;
export type UpdateSupplierMutationResult = NonNullable<Awaited<ReturnType<typeof updateSupplier>>>;
export type UpdateSupplierMutationBody = BodyType<SupplierUpdate>;
export type UpdateSupplierMutationError = ErrorType<unknown>;
/**
* @summary Update a supplier
*/
export declare const useUpdateSupplier: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSupplier>>, TError, {
        id: number;
        data: BodyType<SupplierUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateSupplier>>, TError, {
    id: number;
    data: BodyType<SupplierUpdate>;
}, TContext>;
export declare const getDeleteSupplierUrl: (id: number) => string;
/**
 * @summary Delete a supplier
 */
export declare const deleteSupplier: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteSupplierMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteSupplier>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteSupplier>>, TError, {
    id: number;
}, TContext>;
export type DeleteSupplierMutationResult = NonNullable<Awaited<ReturnType<typeof deleteSupplier>>>;
export type DeleteSupplierMutationError = ErrorType<unknown>;
/**
* @summary Delete a supplier
*/
export declare const useDeleteSupplier: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteSupplier>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteSupplier>>, TError, {
    id: number;
}, TContext>;
export declare const getGetUsersUrl: () => string;
/**
 * @summary List all users
 */
export declare const getUsers: (options?: RequestInit) => Promise<User[]>;
export declare const getGetUsersQueryKey: () => readonly ["/api/users"];
export declare const getGetUsersQueryOptions: <TData = Awaited<ReturnType<typeof getUsers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getUsers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetUsersQueryResult = NonNullable<Awaited<ReturnType<typeof getUsers>>>;
export type GetUsersQueryError = ErrorType<unknown>;
/**
 * @summary List all users
 */
export declare function useGetUsers<TData = Awaited<ReturnType<typeof getUsers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateUserUrl: () => string;
/**
 * @summary Create a user
 */
export declare const createUser: (userInput: UserInput, options?: RequestInit) => Promise<User>;
export declare const getCreateUserMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createUser>>, TError, {
        data: BodyType<UserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createUser>>, TError, {
    data: BodyType<UserInput>;
}, TContext>;
export type CreateUserMutationResult = NonNullable<Awaited<ReturnType<typeof createUser>>>;
export type CreateUserMutationBody = BodyType<UserInput>;
export type CreateUserMutationError = ErrorType<unknown>;
/**
* @summary Create a user
*/
export declare const useCreateUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createUser>>, TError, {
        data: BodyType<UserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createUser>>, TError, {
    data: BodyType<UserInput>;
}, TContext>;
export declare const getUpdateUserUrl: (id: number) => string;
/**
 * @summary Update a user
 */
export declare const updateUser: (id: number, userUpdate: UserUpdate, options?: RequestInit) => Promise<User>;
export declare const getUpdateUserMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
        id: number;
        data: BodyType<UserUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
    id: number;
    data: BodyType<UserUpdate>;
}, TContext>;
export type UpdateUserMutationResult = NonNullable<Awaited<ReturnType<typeof updateUser>>>;
export type UpdateUserMutationBody = BodyType<UserUpdate>;
export type UpdateUserMutationError = ErrorType<unknown>;
/**
* @summary Update a user
*/
export declare const useUpdateUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
        id: number;
        data: BodyType<UserUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateUser>>, TError, {
    id: number;
    data: BodyType<UserUpdate>;
}, TContext>;
export declare const getDeleteUserUrl: (id: number) => string;
/**
 * @summary Delete a user
 */
export declare const deleteUser: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteUserMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export type DeleteUserMutationResult = NonNullable<Awaited<ReturnType<typeof deleteUser>>>;
export type DeleteUserMutationError = ErrorType<unknown>;
/**
* @summary Delete a user
*/
export declare const useDeleteUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export declare const getGetExpensesUrl: (params?: GetExpensesParams) => string;
/**
 * @summary List all expenses
 */
export declare const getExpenses: (params?: GetExpensesParams, options?: RequestInit) => Promise<ExpenseList>;
export declare const getGetExpensesQueryKey: (params?: GetExpensesParams) => readonly ["/api/expenses", ...GetExpensesParams[]];
export declare const getGetExpensesQueryOptions: <TData = Awaited<ReturnType<typeof getExpenses>>, TError = ErrorType<unknown>>(params?: GetExpensesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getExpenses>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getExpenses>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetExpensesQueryResult = NonNullable<Awaited<ReturnType<typeof getExpenses>>>;
export type GetExpensesQueryError = ErrorType<unknown>;
/**
 * @summary List all expenses
 */
export declare function useGetExpenses<TData = Awaited<ReturnType<typeof getExpenses>>, TError = ErrorType<unknown>>(params?: GetExpensesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getExpenses>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateExpenseUrl: () => string;
/**
 * @summary Create an expense
 */
export declare const createExpense: (expenseInput: ExpenseInput, options?: RequestInit) => Promise<Expense>;
export declare const getCreateExpenseMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createExpense>>, TError, {
        data: BodyType<ExpenseInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createExpense>>, TError, {
    data: BodyType<ExpenseInput>;
}, TContext>;
export type CreateExpenseMutationResult = NonNullable<Awaited<ReturnType<typeof createExpense>>>;
export type CreateExpenseMutationBody = BodyType<ExpenseInput>;
export type CreateExpenseMutationError = ErrorType<unknown>;
/**
* @summary Create an expense
*/
export declare const useCreateExpense: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createExpense>>, TError, {
        data: BodyType<ExpenseInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createExpense>>, TError, {
    data: BodyType<ExpenseInput>;
}, TContext>;
export declare const getUpdateExpenseUrl: (id: number) => string;
/**
 * @summary Update an expense
 */
export declare const updateExpense: (id: number, expenseUpdate: ExpenseUpdate, options?: RequestInit) => Promise<Expense>;
export declare const getUpdateExpenseMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateExpense>>, TError, {
        id: number;
        data: BodyType<ExpenseUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateExpense>>, TError, {
    id: number;
    data: BodyType<ExpenseUpdate>;
}, TContext>;
export type UpdateExpenseMutationResult = NonNullable<Awaited<ReturnType<typeof updateExpense>>>;
export type UpdateExpenseMutationBody = BodyType<ExpenseUpdate>;
export type UpdateExpenseMutationError = ErrorType<unknown>;
/**
* @summary Update an expense
*/
export declare const useUpdateExpense: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateExpense>>, TError, {
        id: number;
        data: BodyType<ExpenseUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateExpense>>, TError, {
    id: number;
    data: BodyType<ExpenseUpdate>;
}, TContext>;
export declare const getDeleteExpenseUrl: (id: number) => string;
/**
 * @summary Delete an expense
 */
export declare const deleteExpense: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteExpenseMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteExpense>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteExpense>>, TError, {
    id: number;
}, TContext>;
export type DeleteExpenseMutationResult = NonNullable<Awaited<ReturnType<typeof deleteExpense>>>;
export type DeleteExpenseMutationError = ErrorType<unknown>;
/**
* @summary Delete an expense
*/
export declare const useDeleteExpense: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteExpense>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteExpense>>, TError, {
    id: number;
}, TContext>;
export declare const getGetProfitLossReportUrl: (params?: GetProfitLossReportParams) => string;
/**
 * @summary Get profit and loss report
 */
export declare const getProfitLossReport: (params?: GetProfitLossReportParams, options?: RequestInit) => Promise<ProfitLossReport>;
export declare const getGetProfitLossReportQueryKey: (params?: GetProfitLossReportParams) => readonly ["/api/reports/profit-loss", ...GetProfitLossReportParams[]];
export declare const getGetProfitLossReportQueryOptions: <TData = Awaited<ReturnType<typeof getProfitLossReport>>, TError = ErrorType<unknown>>(params?: GetProfitLossReportParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProfitLossReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProfitLossReport>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProfitLossReportQueryResult = NonNullable<Awaited<ReturnType<typeof getProfitLossReport>>>;
export type GetProfitLossReportQueryError = ErrorType<unknown>;
/**
 * @summary Get profit and loss report
 */
export declare function useGetProfitLossReport<TData = Awaited<ReturnType<typeof getProfitLossReport>>, TError = ErrorType<unknown>>(params?: GetProfitLossReportParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProfitLossReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetInventoryReportUrl: () => string;
/**
 * @summary Get inventory valuation report
 */
export declare const getInventoryReport: (options?: RequestInit) => Promise<InventoryReport>;
export declare const getGetInventoryReportQueryKey: () => readonly ["/api/reports/inventory"];
export declare const getGetInventoryReportQueryOptions: <TData = Awaited<ReturnType<typeof getInventoryReport>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getInventoryReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getInventoryReport>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetInventoryReportQueryResult = NonNullable<Awaited<ReturnType<typeof getInventoryReport>>>;
export type GetInventoryReportQueryError = ErrorType<unknown>;
/**
 * @summary Get inventory valuation report
 */
export declare function useGetInventoryReport<TData = Awaited<ReturnType<typeof getInventoryReport>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getInventoryReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map