import { brands } from "@/data/brands";
import { categories } from "@/data/categories";
export default
    function AddProductPage() {
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">
                Add Product
            </h1>

            <div className="bg-white rounded-xl shadow p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    <input
                        type="text"
                        placeholder="Product Name"
                        className="border p-3 rounded-lg"
                    />

                    <input
                        type="text"
                        placeholder="SKU"
                        className="border p-3 rounded-lg"
                    />

                    <select className="border p-3 rounded-lg">
                        <option>Select Brand</option>

                        {brands.map((brand) => (
                            <option key={brand}>
                                {brand}
                            </option>
                        ))}
                    </select>

                    <select className="border p-3 rounded-lg">
                        <option>Select Category</option>

                        {categories.map((category) => (
                            <option key={category}>
                                {category}
                            </option>
                        ))}
                    </select>

                    <input
                        type="number"
                        placeholder="Buy Price"
                        className="border p-3 rounded-lg"
                    />

                    <input
                        type="number"
                        placeholder="Sell Price"
                        className="border p-3 rounded-lg"
                    />

                    <input
                        type="number"
                        placeholder="Quantity"
                        className="border p-3 rounded-lg"
                    />

                    <input
                        type="number"
                        placeholder="Low Stock Alert"
                        className="border p-3 rounded-lg"
                    />
                    <input
                        type="text"
                        placeholder="Compatible Vehicle (Optional)"
                        className="border p-3 rounded-lg md:col-span-2"
                    />

                    <textarea
                        placeholder="Product Notes"
                        className="border p-3 rounded-lg md:col-span-2"
                    />

                </div>
                <div className="mt-4">
                    <label className="block mb-2 font-medium">
                        Product Image
                    </label>

                    <input
                        type="file"
                        className="border p-3 rounded-lg w-full"
                    />
                </div>

                <button className="mt-6 bg-slate-900 text-white px-6 py-3 rounded-lg">
                    Save Product
                </button>
            </div>
        </div>
    );
}