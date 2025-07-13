require('dotenv').config();
const express = require('express');
const supabase = require('@supabase/supabase-js');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too many requests',
    details: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply to API routes
app.use('/api', apiLimiter);

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Serve the dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// AI Content Analysis
async function analyzeContent(html) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: '',
        messages: [
          {
            role: 'system',
            content: `Analyze webpage content for AI training suitability. Respond ONLY with 'red', 'yellow', or 'green':
            - RED: Contains hate speech, explicit content, or very poor quality
            - YELLOW: Mediocre quality, needs improvement
            - GREEN: High quality, suitable for training`
          },
          {
            role: 'user',
            content: html.substring(0, 8000)
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'Webpage Scanner'
        }
      }
    );

    const result = response.data.choices[0]?.message?.content?.toLowerCase();
    return ['red', 'yellow', 'green'].includes(result) ? result : 'yellow';
  } catch (err) {
    console.error('AI analysis failed:', err.response?.data || err.message);
    return 'yellow';
  }
}

// API Endpoints
app.post('/api/scan', async (req, res) => {
  const { url, html } = req.body;
  
  if (!url || !html) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const status = await analyzeContent(html);
    
    const { data, error } = await supabaseClient
      .from('scanned_pages')
      .insert([{ 
        url, 
        html: html.substring(0, 10000),
        status,
        metadata: {
          length: html.length,
          analyzed_at: new Date().toISOString()
        }
      }]);
    
    if (error) throw error;
    res.status(200).json({ success: true, status });
  } catch (err) {
    console.error('Scan processing error:', err);
    res.status(500).json({ 
      error: 'Failed to process scan',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.get('/api/results', async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from('scanned_pages')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error('Failed to fetch results:', err);
    res.status(500).json({ 
      error: 'Failed to fetch results',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Dashboard available at http://localhost:${PORT}`);
});
