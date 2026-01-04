const nodemailer = require("nodemailer");

// Create reusable transporter object using Gmail SMTP
const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: process.env.EMAIL_USER || "alimuhammadjafar873@gmail.com",
		pass: process.env.EMAIL_PASS || "mypass",
	},
});

/**
 * Send booking confirmation email to customer
 * @param {Object} bookingDetails - Booking information
 * @param {string} bookingDetails.customerEmail - Customer's email address
 * @param {string} bookingDetails.customerName - Customer's name
 * @param {string} bookingDetails.businessName - Business name
 * @param {string} bookingDetails.bookingTitle - Booking summary/title
 * @param {string} bookingDetails.bookingDescription - Booking description
 * @param {string} bookingDetails.startDateTime - Start date and time
 * @param {string} bookingDetails.endDateTime - End date and time
 * @param {string} bookingDetails.timezone - Timezone
 */
async function sendBookingConfirmation(bookingDetails) {
	const {
		customerEmail,
		customerName,
		businessName,
		bookingTitle,
		bookingDescription,
		startDateTime,
		endDateTime,
		timezone,
	} = bookingDetails;

	// Format dates for better readability
	const startDate = new Date(startDateTime);
	const endDate = new Date(endDateTime);

	const formattedStartDate = startDate.toLocaleString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: timezone,
	});

	const formattedEndTime = endDate.toLocaleString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: timezone,
	});

	const mailOptions = {
		from: `"${businessName}" <${
			process.env.EMAIL_USER || "alimuhammadjafar873@gmail.com"
		}>`,
		to: customerEmail,
		subject: `Booking Confirmation - ${bookingTitle}`,
		html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #4CAF50;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: #f9f9f9;
            padding: 20px;
            border: 1px solid #ddd;
            border-top: none;
          }
          .booking-details {
            background-color: white;
            padding: 15px;
            margin: 15px 0;
            border-radius: 5px;
            border-left: 4px solid #4CAF50;
          }
          .detail-row {
            margin: 10px 0;
          }
          .label {
            font-weight: bold;
            color: #555;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            padding: 15px;
            background-color: #f0f0f0;
            border-radius: 0 0 5px 5px;
            font-size: 12px;
            color: #666;
          }
          .checkmark {
            font-size: 48px;
            color: #4CAF50;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="checkmark">✓</div>
          <h1>Booking Confirmed!</h1>
        </div>
        <div class="content">
          <p>Hello ${customerName || "Valued Customer"},</p>
          <p>Your booking with <strong>${businessName}</strong> has been confirmed. We look forward to seeing you!</p>
          
          <div class="booking-details">
            <h2 style="margin-top: 0; color: #4CAF50;">Booking Details</h2>
            
            <div class="detail-row">
              <span class="label">Service:</span> ${bookingTitle}
            </div>
            
            ${
							bookingDescription
								? `
            <div class="detail-row">
              <span class="label">Description:</span> ${bookingDescription}
            </div>
            `
								: ""
						}
            
            <div class="detail-row">
              <span class="label">Date & Time:</span> ${formattedStartDate}
            </div>
            
            <div class="detail-row">
              <span class="label">Duration:</span> Until ${formattedEndTime}
            </div>
            
            <div class="detail-row">
              <span class="label">Timezone:</span> ${timezone}
            </div>
          </div>
          
          <p style="margin-top: 20px;">
            <strong>Important:</strong> Please arrive 5-10 minutes early. If you need to reschedule or cancel, 
            please contact us as soon as possible.
          </p>
          
          <p>
            If you have any questions, feel free to reply to this email or contact us directly.
          </p>
          
          <p>Thank you for choosing ${businessName}!</p>
        </div>
        <div class="footer">
          <p>This is an automated confirmation email. Please do not reply directly to this message.</p>
          <p>&copy; ${new Date().getFullYear()} ${businessName}. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
		text: `
Booking Confirmation

Hello ${customerName || "Valued Customer"},

Your booking with ${businessName} has been confirmed!

Booking Details:
- Service: ${bookingTitle}
${bookingDescription ? `- Description: ${bookingDescription}` : ""}
- Date & Time: ${formattedStartDate}
- Duration: Until ${formattedEndTime}
- Timezone: ${timezone}

Please arrive 5-10 minutes early. If you need to reschedule or cancel, please contact us as soon as possible.

Thank you for choosing ${businessName}!

---
This is an automated confirmation email.
© ${new Date().getFullYear()} ${businessName}. All rights reserved.
    `,
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		console.log("📧 Booking confirmation email sent:", info.messageId);
		return { success: true, messageId: info.messageId };
	} catch (error) {
		console.error("❌ Error sending booking confirmation email:", error);
		return { success: false, error: error.message };
	}
}

/**
 * Send booking cancellation email to customer
 * @param {Object} cancellationDetails - Cancellation information
 */
async function sendBookingCancellation(cancellationDetails) {
	const {
		customerEmail,
		customerName,
		businessName,
		bookingTitle,
		startDateTime,
		timezone,
	} = cancellationDetails;

	const startDate = new Date(startDateTime);
	const formattedStartDate = startDate.toLocaleString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: timezone,
	});

	const mailOptions = {
		from: `"${businessName}" <${
			process.env.EMAIL_USER || "alimuhammadjafar873@gmail.com"
		}>`,
		to: customerEmail,
		subject: `Booking Cancelled - ${bookingTitle}`,
		html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #f44336;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: #f9f9f9;
            padding: 20px;
            border: 1px solid #ddd;
            border-top: none;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            padding: 15px;
            background-color: #f0f0f0;
            border-radius: 0 0 5px 5px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Booking Cancelled</h1>
        </div>
        <div class="content">
          <p>Hello ${customerName || "Valued Customer"},</p>
          <p>Your booking with <strong>${businessName}</strong> has been cancelled.</p>
          
          <p><strong>Cancelled Booking:</strong></p>
          <p>${bookingTitle}<br>
          Scheduled for: ${formattedStartDate}</p>
          
          <p>If you'd like to reschedule or if this cancellation was made in error, please contact us.</p>
          
          <p>We hope to see you soon!</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${businessName}. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		console.log("📧 Booking cancellation email sent:", info.messageId);
		return { success: true, messageId: info.messageId };
	} catch (error) {
		console.error("❌ Error sending booking cancellation email:", error);
		return { success: false, error: error.message };
	}
}

module.exports = {
	sendBookingConfirmation,
	sendBookingCancellation,
};
