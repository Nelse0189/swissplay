import FindScrims from '../../pages/FindScrims';

const ScrimsTab = () => {
  // We can reuse the FindScrims component but maybe simplified or embedded
  // For now, let's just render the FindScrims page content directly
  return (
    <div className="scrims-tab">
      <FindScrims embedded={true} />
    </div>
  );
};

export default ScrimsTab;




