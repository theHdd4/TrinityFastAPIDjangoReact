import pptxgen from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface SlideData {
  id: string;
  textBoxes?: Array<{ text: string; x: number; y: number }>;
  images?: Array<{ url: string; x: number; y: number; width: number; height: number }>;
  charts?: Array<any>;
  tables?: Array<any>;
}

export const exportToPowerPoint = async (slides: SlideData[], title: string = 'Presentation') => {
  const pptx = new pptxgen();

  // Set presentation properties
  pptx.author = 'Exhibition Mode';
  pptx.title = title;
  pptx.subject = 'Exported Presentation';

  for (const slide of slides) {
    const pptSlide = pptx.addSlide();

    // Add text boxes
    if (slide.textBoxes) {
      for (const textBox of slide.textBoxes) {
        // Convert percentage positions to inches (10 inches width, 7.5 inches height)
        const xInches = (textBox.x / 100) * 10;
        const yInches = (textBox.y / 100) * 7.5;

        pptSlide.addText(textBox.text, {
          x: xInches,
          y: yInches,
          w: 3,
          h: 1,
          fontSize: 14,
          color: '363636',
          valign: 'top',
        });
      }
    }

    // Add images
    if (slide.images) {
      for (const image of slide.images) {
        try {
          const xInches = (image.x / 100) * 10;
          const yInches = (image.y / 100) * 7.5;
          const wInches = (image.width / 100) * 10;
          const hInches = (image.height / 100) * 7.5;

          pptSlide.addImage({
            data: image.url,
            x: xInches,
            y: yInches,
            w: wInches,
            h: hInches,
          });
        } catch (error) {
          console.error('Error adding image to slide:', error);
        }
      }
    }

    // Add tables
    if (slide.tables && slide.tables.length > 0) {
      for (const table of slide.tables) {
        const xInches = (table.x / 100) * 10;
        const yInches = (table.y / 100) * 7.5;

        const tableData = table.cells.map((row: any[]) =>
          row.map((cell: any) => cell.content || '')
        );

        pptSlide.addTable(tableData, {
          x: xInches,
          y: yInches,
          w: 8,
          fontSize: 12,
          color: '363636',
          border: { pt: 1, color: 'CFCFCF' },
        });
      }
    }

    // Capture and add charts as images
    if (slide.charts && slide.charts.length > 0) {
      for (const chart of slide.charts) {
        try {
          const chartElement = document.querySelector(`[data-chart-id="${chart.id}"]`);
          if (chartElement) {
            const canvas = await html2canvas(chartElement as HTMLElement, {
              backgroundColor: '#ffffff',
              scale: 2,
            });
            const chartImage = canvas.toDataURL('image/png');

            const xInches = (chart.x / 100) * 10;
            const yInches = (chart.y / 100) * 7.5;
            const wInches = (chart.width / 100) * 10;
            const hInches = (chart.height / 100) * 7.5;

            pptSlide.addImage({
              data: chartImage,
              x: xInches,
              y: yInches,
              w: wInches,
              h: hInches,
            });
          }
        } catch (error) {
          console.error('Error capturing chart:', error);
        }
      }
    }
  }

  // Save the presentation
  await pptx.writeFile({ fileName: `${title}.pptx` });
};

export const exportToPDF = async (slides: SlideData[], title: string = 'Presentation') => {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [1920, 1080],
  });

  let isFirstSlide = true;

  for (const slide of slides) {
    if (!isFirstSlide) {
      pdf.addPage();
    }
    isFirstSlide = false;

    // Capture the entire slide as an image
    const slideElement = document.querySelector(`[data-slide-id="${slide.id}"]`);

    if (slideElement) {
      try {
        const canvas = await html2canvas(slideElement as HTMLElement, {
          backgroundColor: '#ffffff',
          scale: 2,
          width: 1920,
          height: 1080,
          windowWidth: 1920,
          windowHeight: 1080,
        });

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, 1920, 1080);
      } catch (error) {
        console.error('Error capturing slide:', error);

        // Fallback: add basic content
        pdf.setFontSize(16);
        pdf.text(`Slide ${slides.indexOf(slide) + 1}`, 100, 100);

        // Add text boxes
        if (slide.textBoxes) {
          pdf.setFontSize(14);
          slide.textBoxes.forEach((textBox, index) => {
            const x = (textBox.x / 100) * 1920;
            const y = (textBox.y / 100) * 1080;
            pdf.text(textBox.text, x, y + 50 + index * 30);
          });
        }
      }
    }
  }

  pdf.save(`${title}.pdf`);
};

export const exportAsImages = async (slides: SlideData[], title: string = 'Presentation') => {
  for (let i = 0; i < slides.length; i += 1) {
    const slide = slides[i];
    const slideElement = document.querySelector(`[data-slide-id="${slide.id}"]`);

    if (slideElement) {
      try {
        const canvas = await html2canvas(slideElement as HTMLElement, {
          backgroundColor: '#ffffff',
          scale: 2,
          width: 1920,
          height: 1080,
          windowWidth: 1920,
          windowHeight: 1080,
        });

        // Convert canvas to blob and download
        canvas.toBlob(blob => {
          if (!blob) {
            return;
          }

          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${title}-slide-${i + 1}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 'image/png');

        // Add small delay between downloads
        await new Promise(resolve => {
          setTimeout(resolve, 500);
        });
      } catch (error) {
        console.error(`Error exporting slide ${i + 1}:`, error);
      }
    }
  }
};
