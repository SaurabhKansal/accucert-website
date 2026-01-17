export async function getLayoutHtml(imageUrl: string) {
    const response = await fetch('https://api.codia.ai/v1/open/image_to_code', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CODIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_url: imageUrl,
        platform: 'web',
        framework: 'react',
        style: 'tailwind' // This makes the output clean and easy to render
      })
    });
  
    if (!response.ok) {
      throw new Error('Codia AI failed to process the image');
    }
  
    const data = await response.json();
    // Codia returns a code object containing the HTML and CSS
    return data.code.html; 
  }