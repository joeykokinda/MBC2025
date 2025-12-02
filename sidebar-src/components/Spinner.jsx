// LOADING SPINNER COMPONENT
// Shows a loading animation while markets are being fetched
// Displays when: loading state is true

export default function Spinner() {
  return (
    <div className="spinner-container">
      <div className="spinner"></div>
      <p>Analyzing page and fetching markets...</p>
    </div>
  );
}
