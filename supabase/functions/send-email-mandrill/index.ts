import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  to: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  html: string;
  from_email?: string;
  from_name?: string;
  subaccount?: string;
  template_variables?: Record<string, string>;
}

interface MandrillResponse {
  _id: string;
  email: string;
  status: string;
  reject_reason?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', success: false }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication failed:', authError?.message || 'No user found');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', success: false }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    console.log('Email request authorized for user:', user.id);

    const emailRequest: EmailRequest = await req.json();
    console.log('Sending email request:', { 
      to: emailRequest.to, 
      subject: emailRequest.subject,
      subaccount: emailRequest.subaccount 
    });

    const apiKey = Deno.env.get('MAILCHIMP_API_KEY');
    if (!apiKey) {
      throw new Error('MAILCHIMP_API_KEY not configured');
    }

    // Process template variables in HTML content
    let processedHtml = emailRequest.html;
    if (emailRequest.template_variables) {
      Object.entries(emailRequest.template_variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        processedHtml = processedHtml.replace(regex, value);
      });
    }

    // Process template variables in subject
    let processedSubject = emailRequest.subject;
    if (emailRequest.template_variables) {
      Object.entries(emailRequest.template_variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        processedSubject = processedSubject.replace(regex, value);
      });
    }

    // Prepare Mandrill API request
    const mandrillRequest = {
      key: apiKey,
      message: {
        html: processedHtml,
        subject: processedSubject,
        from_email: emailRequest.from_email || 'pintosoft@netvice.nl',
        from_name: emailRequest.from_name || 'Mendix Monitoring',
        to: emailRequest.to,
        preserve_recipients: true,
        subaccount: emailRequest.subaccount || undefined,
      },
    };

    console.log('Sending to Mandrill API...');
    
    // Send email via Mandrill API
    const response = await fetch('https://mandrillapp.com/api/1.0/messages/send.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mandrillRequest),
    });

    const responseData = await response.json() as MandrillResponse[];
    
    if (!response.ok) {
      console.error('Mandrill API error:', responseData);
      throw new Error(`Mandrill API error: ${response.status}`);
    }

    console.log('Email sent successfully:', responseData);

    // Check for rejected emails
    const rejected = responseData.filter(r => r.status === 'rejected');
    if (rejected.length > 0) {
      console.warn('Some emails were rejected:', rejected);
    }

    return new Response(JSON.stringify({
      success: true,
      results: responseData,
      sent: responseData.filter(r => r.status === 'sent').length,
      rejected: rejected.length,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error in send-email-mandrill function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);