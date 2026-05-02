import { submitReport } from '../services/api';
import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, File, AlertCircle, CheckCircle, Shield } from "lucide-react";
import { User } from "../types";
import { Language, t } from "../i18n";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface ReportFormProps {
  user: any | null;
  language: Language;
  onSuccess: () => void;
}

export default function ReportForm({
  user,
  language,
  onSuccess,
}: ReportFormProps) {
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // 📁 Drag & Drop
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setError(null);

    if (rejectedFiles.length > 0) {
      setError("Some files are invalid or exceed size limit (10MB).");
      return;
    }

    if (files.length + acceptedFiles.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed.`);
      return;
    }

    setFiles((prev) => [...prev, ...acceptedFiles]);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: MAX_FILE_SIZE,
    maxFiles: MAX_FILES,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // 🚀 Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0 && description === "") {
      setError("Please provide a description or attach evidence before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await submitReport(description, files);

      setIsSuccess(true);

      // ✅ IMPORTANT: notify parent (App.tsx)
      onSuccess();

    } catch (err: any) {
      setError(err.message || "Failed to connect to the secure server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ Success UI
  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-green-50 rounded-xl border border-green-200">
        <CheckCircle className="w-16 h-16 text-green-600 mb-4" />
        <h3 className="text-2xl font-bold text-green-900">
          {t(language, "reportSubmitted") || "Report Submitted Securely"}
        </h3>
        <p className="text-green-700 mt-2 text-center">
          {t(language, "reportSuccessMessage") ||
            "Your evidence has been encrypted and sent for analysis. Your anonymity remains fully protected."}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-lg border border-gray-100"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 text-slate-700">
        <Shield className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold">
          {t(language, "secureUpload") || "Secure Upload Portal"}
        </h2>
      </div>

      {/* Description */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t(language, "description") || "Description of Events"}
        </label>
        <textarea
          className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none h-32"
          placeholder="Detail what happened, who is involved, and what the attached evidence proves..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Drag & Drop */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
        ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50 hover:bg-gray-100"}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className={`w-12 h-12 mx-auto mb-4 ${isDragActive ? "text-blue-500" : "text-gray-400"}`} />
        <p className="text-gray-600 font-medium">
          Drag & drop your files here, or click to browse
        </p>
        <p className="text-sm text-gray-400 mt-2">
          Supports Images, PDFs, DOCX, MP4 (Max 10MB)
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">
            Attached Evidence ({files.length})
          </h4>

          {files.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 border rounded-lg">
              <div className="flex items-center gap-3">
                <File className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-700 truncate max-w-xs">
                  {file.name}
                </span>
              </div>

              <button
                type="button"
                onClick={() => removeFile(index)}
                className="text-red-500 hover:text-red-700 text-sm font-medium"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting || (files.length === 0 && description === "")}
        className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
      >
        {isSubmitting
          ? "Encrypting & Sending..."
          : "Submit Report Anonymously"}
      </button>
    </form>
  );
}