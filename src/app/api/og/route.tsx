import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';



export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'Saarthi — Your Safe Space';
    const description = searchParams.get('description') || 'Book online counselling and mental health therapy sessions with expert guides.';

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FAF9F6',
            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(200, 190, 170, 0.15) 0%, rgba(250, 249, 246, 1) 100%)',
            padding: '40px 80px',
            position: 'relative',
          }}
        >
          {/* Top border decor */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '8px',
              backgroundColor: '#A08246',
            }}
          />

          {/* Logo / Brand Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '30px',
            }}
          >
            <span
              style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: '#4A5D4E',
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
              }}
            >
              SAARTHI
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              maxWidth: '900px',
            }}
          >
            <h1
              style={{
                fontSize: '56px',
                fontWeight: '700',
                color: '#2C3A2E',
                marginBottom: '20px',
                lineHeight: 1.2,
                fontFamily: 'serif',
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontSize: '22px',
                color: '#556A5B',
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: '50px',
              fontSize: '16px',
              fontStyle: 'italic',
              color: '#A08246',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            Guided Therapy & Emotional Support • saarthilife.com
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Failed to generate sharing image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
