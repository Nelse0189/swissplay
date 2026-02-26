import './DigitalOverlay.css';

const DigitalOverlay = () => {
  const overlayTexts = [
    { text: 'SYS.FOR.NULL', top: '15%', left: '2%' },
    { text: '00 0000 <<', top: '18%', left: '2%' },
    { text: '<<', top: '21%', left: '5%' },
    { text: '100 / 200', top: '40%', left: '80%' },
    { text: '001', top: '38%', left: '92%' },
    { text: '34-T', top: '40%', left: '92%', highlight: true },
    { text: '0001 +', top: '42%', left: '92%' },
    { text: '500 +', top: '50%', left: '91%' },
    { text: 'RT', top: '52%', left: '91%' },
    { text: '100-100', top: '60%', left: '92%' },
    { text: '0032 209', top: '70%', left: '92%' },
    { text: 'RTO [340]', top: '72%', left: '92%', highlight: true },
    { text: 'KFT - 00101000 >> 500', top: '90%', left: '2%' },
    { text: '0002300', top: '93%', left: '2%' },
    { text: 'KJ-025', top: '20%', left: '94%', highlight: true },
    { text: 'FR', top: '10%', left: '95%' },
    { text: 'FT', top: '8%', left: '95%' },
  ];

  return (
    <div className="digital-overlay">
      {overlayTexts.map((item, index) => (
        <div
          key={index}
          className={`overlay-text ${item.highlight ? 'highlighted' : ''}`}
          style={{ top: item.top, left: item.left }}
        >
          {item.text}
        </div>
      ))}
      <div className="crosshair top-left">+</div>
      <div className="crosshair top-right">+</div>
      <div className="crosshair bottom-left">+</div>
      <div className="crosshair bottom-right">+</div>
    </div>
  );
};

export default DigitalOverlay;
