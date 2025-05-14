export default function TestPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="p-8 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-blue-500 mb-4">
          Tailwind Test Page
        </h1>
        <p className="mb-4 text-gray-700 dark:text-gray-300">
          This is a test page to see if Tailwind CSS is working properly.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-green-500 text-white rounded">Green Box</div>
          <div className="p-4 bg-red-500 text-white rounded">Red Box</div>
          <div className="p-4 bg-blue-500 text-white rounded">Blue Box</div>
          <div className="p-4 bg-purple-500 text-white rounded">Purple Box</div>
        </div>
      </div>
    </div>
  );
}
